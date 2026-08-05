import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import {
  Message,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type ButtonInteraction,
  type FetchMessagesOptions,
  ComponentType,
  ButtonStyle,
  Collection,
} from "discord.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import {
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "#lib/utilities/cards.js";
import { logError, errorCode } from "#lib/utilities/errors.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";
import { parseDuration, formatDuration } from "#lib/utilities/time.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { validateRegexPattern } from "#lib/regex-worker/index.js";
import type { LumiT } from "#lib/i18n/index.js";

type MessageFilter = (message: Message) => boolean;

const URL_RE = /https?:\/\/\S+/i;
const DEFAULT_FILTER_SCAN = 100;
/** Hard cap on messages fetched while searching for filter matches, so a filter that rarely
 * hits (typo'd regex, inactive user) can't walk an entire channel's history. */
const MAX_SCAN = 2000;

@ApplyOptions<BaseSubcommand.Options>({
  name: "purge",
  description: "Bulk delete messages in this channel, with optional filters.",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  requiredClientPermissions: [PermissionFlagsBits.ManageMessages],
  prefixEnabled: true,
  subcommands: [
    { name: "messages", run: "messages", default: true },
    { name: "user", run: "user" },
    { name: "bots", run: "bots" },
    { name: "links", run: "links" },
    { name: "regex", run: "regex" },
    { name: "duration", run: "duration" },
  ],
})
export class PurgeCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
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
                .setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("amount")
                .setDescription("How many matching messages to delete (default 100)")
                .setMinValue(1)
                .setMaxValue(1000),
            ),
        ),
    );
  }

  public async messages(ctx: CommandContext) {
    const amount = await ctx.getInteger("amount", { required: true });
    return this.runPurge(ctx, amount!, null, "");
  }

  public async user(ctx: CommandContext) {
    const target = await ctx.getUser("user", { required: true });
    const amount = (await ctx.getInteger("amount")) ?? DEFAULT_FILTER_SCAN;
    return this.runPurge(
      ctx,
      amount,
      (m) => m.author.id === target!.id,
      `from **${target!.tag}**`,
    );
  }

  public async bots(ctx: CommandContext) {
    const amount = (await ctx.getInteger("amount")) ?? DEFAULT_FILTER_SCAN;
    return this.runPurge(ctx, amount, (m) => m.author.bot, "sent by bots");
  }

  public async links(ctx: CommandContext) {
    const amount = (await ctx.getInteger("amount")) ?? DEFAULT_FILTER_SCAN;
    return this.runPurge(
      ctx,
      amount,
      (m) => URL_RE.test(m.content),
      "containing a link",
    );
  }

  public async regex(ctx: CommandContext) {
    const pattern = await ctx.getString("pattern", { required: true });
    const amount = (await ctx.getInteger("amount")) ?? DEFAULT_FILTER_SCAN;
    // The compiled pattern runs against up to MAX_SCAN messages on the
    // gateway's own event loop, so a catastrophically backtracking pattern
    // would stall every guild on this process, not just this one.
    const rejection = await validateRegexPattern(pattern!);
    if (rejection) {
      return ctx.replyError(
        "Invalid Pattern",
        `\`${pattern}\` was rejected: ${rejection}`,
      );
    }
    const compiled = new RegExp(pattern!, "i");
    return this.runPurge(
      ctx,
      amount,
      (m) => compiled.test(m.content),
      `matching \`${pattern}\``,
    );
  }

  public async duration(ctx: CommandContext) {
    const raw = await ctx.getString("duration", { required: true });
    const ms = parseDuration(raw!);
    if (!ms) {
      return ctx.replyError(
        "Invalid Duration",
        `Could not parse \`${raw}\` as a duration. Try something like \`10m\`, \`2h\`, or \`1d\`.`,
      );
    }
    const amount = (await ctx.getInteger("amount")) ?? DEFAULT_FILTER_SCAN;
    const cutoff = Date.now() - ms;
    return this.runPurge(
      ctx,
      amount,
      (m) => m.createdTimestamp >= cutoff,
      `sent within the last ${formatDuration(ms)}`,
    );
  }

  private async runPurge(
    ctx: CommandContext,
    amount: number,
    filter: MessageFilter | null,
    filterDescription: string,
  ) {
    const t = await ctx.fetchT();

    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return ctx.replyError(
        t(LanguageKeys.Commands.PurgeInvalidAmountTitle),
        t(LanguageKeys.Commands.PurgeInvalidAmount),
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
      const res = await this.promptForConfirmation(
        channel,
        ctx.user.id,
        amount,
        suffix,
        t,
      );
      if (!res.confirmed) {
        if (ctx.isSlash) {
          await ctx.replyInfo(
            t(LanguageKeys.Commands.PurgeCancelledTitle),
            t(LanguageKeys.Commands.PurgeCancelledText),
          );
        }
        return;
      }
      prompt = res.prompt;
    } else {
      prompt = await channel.send({
        ...makeSuccessCard(
          t(LanguageKeys.Commands.PurgeInitiatingTitle),
          `Initiating deletion of up to ${amount} message(s)${suffix}.`,
        ),
        allowedMentions: {},
      });
    }

    void this.executePurge(channel, amount, prompt, filter, t);

    if (ctx.isSlash) {
      await ctx.replySuccess(
        "Purge Started",
        `Purging up to **${amount}** message(s)${suffix} in this channel...`,
      );
    }
  }

  private async executePurge(
    channel: GuildTextBasedChannel,
    amount: number,
    prompt: Message,
    filter: MessageFilter | null,
    t: LumiT,
  ) {
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
          this.container.logger.debug(
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
      while (remaining > 0 && (!filter || scanned < MAX_SCAN)) {
        const limit = Math.min(remaining, 100);

        const fetchOptions: FetchMessagesOptions = { limit: filter ? 100 : limit };
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

        const now = Date.now();
        const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

        const youngMessages: Message[] = [];
        const oldMessages: Message[] = [];

        for (const msg of messages.values()) {
          if (msg.id === prompt.id) continue;
          if (filter && !filter(msg)) continue;

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
            this.container.logger.error(
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
                this.container.logger.error(
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
          t(LanguageKeys.Commands.PurgeCompleteTitle),
          t(LanguageKeys.Commands.PurgeComplete, { count: deletedCount }),
        ),
        allowedMentions: {},
      });
      deleteMessageLater(
        completedCard,
        undefined,
        "Purge: delete completedCard",
      );
    } catch (err: unknown) {
      this.container.logger.error(
        "[Purge] Background purge execution failed:",
        err,
      );
      await prompt
        .delete()
        .catch((err: unknown) =>
          logError("Purge: Failed to delete prompt", err),
        );
    }
  }

  private async promptForConfirmation(
    channel: GuildTextBasedChannel,
    authorId: string,
    amount: number,
    suffix: string,
    t: LumiT,
  ): Promise<{ prompt: Message; confirmed: boolean }> {
    const actionRows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("purge-confirm")
          .setLabel(t(LanguageKeys.Commands.PurgeConfirmBtn))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("purge-cancel")
          .setLabel(t(LanguageKeys.Commands.PurgeCancelBtn))
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    const prompt = await channel.send({
      ...makeWarningCard(
        t(LanguageKeys.Commands.PurgeConfirmTitle),
        `Are you sure you want to delete up to ${amount} message(s)${suffix}?`,
        { actionRows },
      ),
      allowedMentions: {},
    });

    try {
      const filter = (i: ButtonInteraction) => i.user.id === authorId;
      const confirmation = await prompt.awaitMessageComponent({
        filter,
        componentType: ComponentType.Button,
        time: 15_000,
      });

      if (confirmation.customId === "purge-confirm") {
        await confirmation.update({
          ...makeSuccessCard(
            t(LanguageKeys.Commands.PurgeInitiatingTitle),
            `Proceeding with deletion of up to ${amount} message(s)${suffix}.`,
          ),
        });
        return { prompt, confirmed: true };
      }

      await confirmation.update({
        ...makeErrorCard(
          t(LanguageKeys.Commands.PurgeCancelledTitle),
          t(LanguageKeys.Commands.PurgeCancelledText),
        ),
      });
      deleteMessageLater(
        confirmation.message,
        undefined,
        "Purge: delete confirmation message",
      );
      return { prompt, confirmed: false };
    } catch {
      await prompt.edit({
        ...makeErrorCard(
          t(LanguageKeys.Commands.PurgeCancelledTitle),
          t(LanguageKeys.Commands.PurgeTimeoutText),
        ),
      });
      deleteMessageLater(
        prompt,
        undefined,
        "Purge: delete prompt after timeout",
      );
      return { prompt, confirmed: false };
    }
  }
}
