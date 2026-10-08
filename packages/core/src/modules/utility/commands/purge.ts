import type { Container } from "#lib/services.js";
import { respondWithChoices, filterAutocompleteChoices } from "#lib/utilities/autocomplete.js";
import { SlashCommandBuilder, type AutocompleteInteraction } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/commands/context.js";
import { Ms } from "@lumi/shared";
import {
  Message,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type FetchMessagesOptions,
  Collection,
} from "discord.js";
import { makeErrorCard, makeSuccessCard, makeWarningCard } from "#lib/ui/cards.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import { logError, errorCode } from "#lib/utilities/errors.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";
import { parseDuration, formatDuration } from "#lib/utilities/time.js";
import {
  MatchBatchSize,
  getRegexWorker,
} from "#lib/regex-worker/RegexWorkerHandler.js";
import { validateRegexPattern } from "#lib/regex-worker/validate.js";
import type { LumiT } from "#lib/i18n/index.js";

type MessageFilter = (message: Message) => boolean;

/**
 * Ids of the messages in one fetched page that pass the filter, for matching
 * that cannot run on the gateway event loop and has to go through the regex
 * worker's sandbox and budget.
 */
type MessageBatchFilter = (messages: Message[]) => Promise<Set<string>>;

class PurgeAbortedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PurgeAbortedError";
  }
}

const UrlRe = /https?:\/\/\S+/i;
const DefaultFilterScan = 100;
/** Hard cap on messages fetched while searching for filter matches, so a filter that rarely
 * hits (typo'd regex, inactive user) can't walk an entire channel's history. */
const MaxScan = 2000;

async function runPurge(
  ctx: CommandContext,
  amount: number,
  filter: MessageFilter | null,
  filterDescription: string,
  batchFilter: MessageBatchFilter | null = null,
) {
  const t = await ctx.fetchT();

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    return ctx.replyError(
      t("commands:purgeInvalidAmountTitle"),
      t("commands:purgeInvalidAmount"),
    );
  }

  const channel = ctx.guild?.channels.cache.get(ctx.channelId) as
    | GuildTextBasedChannel
    | undefined;
  if (!channel || !channel.isTextBased()) {
    return ctx.replyError(
      "Invalid Channel",
      "This command can only be used in a text channel.",
    );
  }

  await ctx.defer();
  if (!ctx.isSlash) {
    await ctx.message
      .delete()
      .catch((err: unknown) =>
        logError("Purge: Failed to delete trigger message", err),
      );
  }

  const suffix = filterDescription ? ` ${filterDescription}` : "";
  let prompt: Message;

  if (amount > 50) {
    const res = await promptForConfirmation(
      ctx,
      channel,
      amount,
      suffix,
      t,
    );
    if (!res.confirmed) {
      if (ctx.isSlash) {
        await ctx.replyInfo(
          t("commands:purgeCancelledTitle"),
          t("commands:purgeCancelledText"),
        );
      }
      return;
    }
    prompt = res.prompt;
  } else {
    prompt = await channel.send({
      ...makeSuccessCard(
        t("commands:purgeInitiatingTitle"),
        `Initiating deletion of up to ${amount} message(s)${suffix}.`,
      ),
      allowedMentions: {},
    });
  }

  void executePurge(ctx.services, channel, amount, prompt, filter, t, batchFilter);

  if (ctx.isSlash) {
    await ctx.replySuccess(
      "Purge Started",
      `Purging up to **${amount}** message(s)${suffix} in this channel...`,
    );
  }
}

async function executePurge(
  services: Container,
  channel: GuildTextBasedChannel,
  amount: number,
  prompt: Message,
  filter: MessageFilter | null,
  t: LumiT,
  batchFilter: MessageBatchFilter | null = null,
) {
  const hasFilter = Boolean(filter ?? batchFilter);
  let deletedCount = 0;
  let remaining = amount;
  let scanned = 0;
  let lastMessageId: string | undefined = undefined;

  const safeBulkDelete = async (msgs: Message[]): Promise<number> => {
    if (msgs.length === 0) return 0;
    if (msgs.length <= 2) {
      let count = 0;
      for (const m of msgs) {
        const success = await m
          .delete()
          .then(() => true)
          .catch((err: unknown) => errorCode(err) === 10008);
        if (success) count++;
      }
      return count;
    }
    try {
      const res = await channel.bulkDelete(msgs, true);
      return res.size;
    } catch (err: unknown) {
      if (errorCode(err) === 10008) {
        services.logger.debug(
          `[Purge] Bulk delete of ${msgs.length} messages failed with 10008 (Unknown Message). Splitting chunk...`,
        );
        const mid = Math.floor(msgs.length / 2);
        const left = msgs.slice(0, mid);
        const right = msgs.slice(mid);
        const leftDeleted = await safeBulkDelete(left);
        const rightDeleted = await safeBulkDelete(right);
        return leftDeleted + rightDeleted;
      }
      throw err;
    }
  };

  try {
    while (remaining > 0 && (!hasFilter || scanned < MaxScan)) {
      const limit = Math.min(remaining, 100);

      const fetchOptions: FetchMessagesOptions = {
        limit: hasFilter ? 100 : limit,
      };
      if (lastMessageId) fetchOptions.before = lastMessageId;

      const messages = (await channel.messages
        .fetch(fetchOptions)
        .catch(() => null)) as Collection<string, Message> | null;
      if (!messages || messages.size === 0) break;

      const oldestMessage = messages.last();
      if (oldestMessage) {
        lastMessageId = oldestMessage.id;
      }

      scanned += messages.size;

      // Resolved once per page so a sandboxed matcher costs one round trip
      // per page rather than one per message.
      const batchMatched = batchFilter
        ? await batchFilter(
            [...messages.values()].filter((m) => m.id !== prompt.id),
          )
        : null;

      const now = Date.now();
      const fourteenDaysAgo = now - 14 * Ms.Day;

      const youngMessages: Message[] = [];
      const oldMessages: Message[] = [];

      for (const msg of messages.values()) {
        if (msg.id === prompt.id) continue;
        if (filter && !filter(msg)) continue;
        if (batchMatched && !batchMatched.has(msg.id)) continue;

        if (msg.createdTimestamp > fourteenDaysAgo) {
          youngMessages.push(msg);
        } else {
          oldMessages.push(msg);
        }
        if (youngMessages.length + oldMessages.length >= remaining) break;
      }

      if (youngMessages.length > 0) {
        try {
          const numDeleted = await safeBulkDelete(youngMessages);
          deletedCount += numDeleted;
          remaining -= numDeleted;
        } catch (err: unknown) {
          services.logger.error(
            "[Purge] safeBulkDelete failed, falling back to individual slow deletions:",
            err,
          );
          oldMessages.push(...youngMessages);
        }
      }

      if (oldMessages.length > 0) {
        for (const msg of oldMessages) {
          const success = await msg
            .delete()
            .then(() => true)
            .catch((err: unknown) => {
              if (errorCode(err) === 10008) {
                return true;
              }
              services.logger.error(
                `[Purge] Individual delete failed for message ${msg.id}:`,
                err,
              );
              return false;
            });

          if (success) {
            deletedCount++;
            remaining--;
          }
        }
      }
    }

    await prompt
      .delete()
      .catch((err: unknown) =>
        logError("Purge: Failed to delete prompt", err),
      );
    const completedCard = await channel.send({
      ...makeSuccessCard(
        t("commands:purgeCompleteTitle"),
        t("commands:purgeComplete", { count: deletedCount }),
      ),
      allowedMentions: {},
    });
    deleteMessageLater(
      completedCard,
      undefined,
      "Purge: delete completedCard",
    );
  } catch (err: unknown) {
    services.logger.error(
      "[Purge] Background purge execution failed:",
      err,
    );
    await prompt
      .delete()
      .catch((err: unknown) =>
        logError("Purge: Failed to delete prompt", err),
      );
    if (err instanceof PurgeAbortedError) {
      const card = await channel
        .send({
          ...makeWarningCard("Purge Stopped", err.message),
          allowedMentions: {},
        })
        .catch(() => null);
      if (card) {
        deleteMessageLater(card, undefined, "Purge: delete abort notice");
      }
    }
  }
}

async function promptForConfirmation(
  ctx: CommandContext,
  channel: GuildTextBasedChannel,
  amount: number,
  suffix: string,
  t: LumiT,
): Promise<{ prompt: Message; confirmed: boolean }> {
  const { confirmed, message: prompt } = await confirmPrompt(ctx, {
    channel,
    title: t("commands:purgeConfirmTitle"),
    body: `Are you sure you want to delete up to ${amount} message(s)${suffix}?`,
    confirmLabel: t("commands:purgeConfirmBtn"),
    cancelLabel: t("commands:purgeCancelBtn"),
    time: 15_000,
  });

  if (confirmed) {
    await prompt.edit({
      ...makeSuccessCard(
        t("commands:purgeInitiatingTitle"),
        `Proceeding with deletion of up to ${amount} message(s)${suffix}.`,
      ),
    });
    return { prompt, confirmed: true };
  }

  await prompt.edit({
    ...makeErrorCard(
      t("commands:purgeCancelledTitle"),
      t("commands:purgeCancelledText"),
    ),
  });
  deleteMessageLater(prompt, undefined, "Purge: delete prompt after cancel/timeout");
  return { prompt, confirmed: false };
}

export const purgeDef: CommandDef = {
  name: "purge",
  description: "Bulk delete messages in this channel, with optional filters.",
  guildOnly: true,
  requiredPermit: "mod.*",
  requiredClientPermissions: [PermissionFlagsBits.ManageMessages],
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("purge");
    return (
      b
        .setName("purge")
        .setDescription("Bulk delete messages in this channel, with optional filters.")
        .addSubcommand((s) =>
          s
            .setName("messages")
            .setDescription("Delete the most recent messages")
            .addIntegerOption((o) =>
              o
                .setName("amount")
                .setDescription("Number of messages to delete (1-1000)")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("user")
            .setDescription("Delete recent messages from a specific member")
            .addUserOption((o) =>
              o.setName("user").setDescription("Member to target").setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("amount")
                .setDescription("How many matching messages to delete (default 100)")
                .setMinValue(1)
                .setMaxValue(1000),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("bots")
            .setDescription("Delete recent messages sent by bots")
            .addIntegerOption((o) =>
              o
                .setName("amount")
                .setDescription("How many matching messages to delete (default 100)")
                .setMinValue(1)
                .setMaxValue(1000),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("links")
            .setDescription("Delete recent messages containing a link")
            .addIntegerOption((o) =>
              o
                .setName("amount")
                .setDescription("How many matching messages to delete (default 100)")
                .setMinValue(1)
                .setMaxValue(1000),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("regex")
            .setDescription("Delete recent messages matching a regular expression")
            .addStringOption((o) =>
              o
                .setName("pattern")
                .setDescription("Regular expression to test message content against")
                .setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("amount")
                .setDescription("How many matching messages to delete (default 100)")
                .setMinValue(1)
                .setMaxValue(1000),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("duration")
            .setDescription("Delete recent messages newer than a given age")
            .addStringOption((o) =>
              o
                .setName("duration")
                .setDescription("How far back to reach, e.g. 10m, 2h, 1d")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("amount")
                .setDescription("How many matching messages to delete (default 100)")
                .setMinValue(1)
                .setMaxValue(1000),
            ),
        )
    );
  },
  handlers: {
    messages: async (ctx: CommandContext) => {
      const amount = await ctx.getInteger("amount", { required: true });
      return runPurge(ctx, amount!, null, "");
    },
    user: async (ctx: CommandContext) => {
      const target = await ctx.getUser("user", { required: true });
      const amount = (await ctx.getInteger("amount")) ?? DefaultFilterScan;
      return runPurge(
        ctx,
        amount,
        (m) => m.author.id === target!.id,
        `from **${target!.tag}**`,
      );
    },
    bots: async (ctx: CommandContext) => {
      const amount = (await ctx.getInteger("amount")) ?? DefaultFilterScan;
      return runPurge(ctx, amount, (m) => m.author.bot, "sent by bots");
    },
    links: async (ctx: CommandContext) => {
      const amount = (await ctx.getInteger("amount")) ?? DefaultFilterScan;
      return runPurge(
        ctx,
        amount,
        (m) => UrlRe.test(m.content),
        "containing a link",
      );
    },
    regex: async (ctx: CommandContext) => {
      const pattern = await ctx.getString("pattern", { required: true });
      const amount = (await ctx.getInteger("amount")) ?? DefaultFilterScan;
      // The save-time probe only proves the pattern survives a canned corpus;
      // real message content can still trigger catastrophic backtracking. So the
      // match itself runs in the regex worker under a hard budget rather than on
      // the gateway's event loop, where a hang would stall every guild on this
      // process.
      const rejection = await validateRegexPattern(pattern!);
      if (rejection) {
        return ctx.replyError(
          "Invalid Pattern",
          `\`${pattern}\` was rejected: ${rejection}`,
        );
      }

      const batchFilter: MessageBatchFilter = async (messages) => {
        const matched = new Set<string>();
        for (let i = 0; i < messages.length; i += MatchBatchSize) {
          const batch = messages.slice(i, i + MatchBatchSize);
          const indexes = await getRegexWorker()
            .matchAll(
              pattern!,
              batch.map((m) => m.content),
            )
            .catch(() => {
              // Budget blown on real content: fail closed, deleting nothing.
              throw new PurgeAbortedError(
                `\`${pattern}\` took too long to evaluate against real messages and was stopped. No messages were deleted.`,
              );
            });
          if (indexes === null) {
            throw new PurgeAbortedError(
              "The regex sandbox is unavailable, so `purge regex` cannot run right now. No messages were deleted.",
            );
          }
          for (const index of indexes) matched.add(batch[index]!.id);
        }
        return matched;
      };

      return runPurge(
        ctx,
        amount,
        null,
        `matching \`${pattern}\``,
        batchFilter,
      );
    },
    duration: async (ctx: CommandContext) => {
      const raw = await ctx.getString("duration", { required: true });
      const ms = parseDuration(raw!);
      if (!ms) {
        return ctx.replyError(
          "Invalid Duration",
          `Could not parse \`${raw}\` as a duration. Try something like \`10m\`, \`2h\`, or \`1d\`.`,
        );
      }
      const amount = (await ctx.getInteger("amount")) ?? DefaultFilterScan;
      const cutoff = Date.now() - ms;
      return runPurge(
        ctx,
        amount,
        (m) => m.createdTimestamp >= cutoff,
        `sent within the last ${formatDuration(ms)}`,
      );
    },
  },
  defaultSub: "messages",
  autocomplete: async (
    _services: Container,
    interaction: AutocompleteInteraction,
  ): Promise<void> => {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "duration") {
      const presets = ["5m", "10m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "7d", "14d"];
      return respondWithChoices(
        interaction,
        filterAutocompleteChoices(presets, focused.value),
      );
    }
    return respondWithChoices(interaction, []);
  },
};
