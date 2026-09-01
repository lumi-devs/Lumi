import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "@discordjs/builders";
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import { GuildMessageListener } from "#lib/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import { makeCard } from "#lib/utilities/cards.js";
import { createActionButton, buildSafeActionRows } from "#lib/utilities/panels.js";
import { logError } from "#lib/utilities/errors.js";
import { canSendMessages } from "#lib/utilities/misc.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { AfkKeys } from "../keys.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  AfkMentionCooldownMs,
  AfkNickEditCooldownMs,
  AfkWelcomeCooldownMs,
  NickPrefix,
  afkDurationSince,
  sanitizeReason,
} from "../index.js";
import {
  getAfkEntry,
  getAfkEntriesBatch,
  isAfkOnCooldown,
  claimAfkCooldown,
  getAfkMentions,
  clearAfkEntry,
  clearAfkMentions,
  addAfkMentionsBatch,
} from "../data/afk.js";

import { fetchTyped } from "#lib/commands.js";

@ApplyOptions<GuildMessageListener.Options>({
  name: "afkMessageCreate",
  module: "afk",
})
export default class AFKMessageCreateListener extends GuildMessageListener {
  protected async handle(message: GuildMessage): Promise<void> {
    const entry = await getAfkEntry(message.guildId, message.author.id);
    if (entry) {
      const prefixes = await this.container.client.fetchPrefix(message);
      const prefixList = prefixes
        ? Array.isArray(prefixes)
          ? prefixes
          : [prefixes]
        : [];
      const isCommand = prefixList.some(
        (p) => typeof p === "string" && message.content.startsWith(p),
      );

      if (
        !isCommand &&
        !(await isAfkOnCooldown(
          AfkKeys.removalCooldown(message.guildId, message.author.id),
        ))
      ) {
        await this.#removeAfk(message, entry.since);
      }
    }

    if (message.mentions.users.size) await this.#notifyMentioned(message);
  }

  async #removeAfk(message: GuildMessage, since: Date) {
    const { guildId, channelId } = message;
    const userId = message.author.id;

    const mentions = await getAfkMentions(guildId, userId);
    await clearAfkEntry(guildId, userId).catch((err: unknown) =>
      logError("AFK: Clear entry failed", err),
    );

    if (message.member?.displayName.startsWith(NickPrefix)) {
      const newNick = message.member.displayName
        .slice(NickPrefix.length)
        .trim();
      void this.#editNick(userId, () =>
        message.member!.setNickname(newNick || null),
      );
    }

    if (
      !(await claimAfkCooldown(
        AfkKeys.welcomeCooldown(channelId, userId),
        AfkWelcomeCooldownMs,
      ))
    )
      return;
    if (!message.channel.isSendable() || !canSendMessages(message)) return;

    const t = await fetchTyped(message);

    const actionRows = mentions.length
      ? buildSafeActionRows([
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            createActionButton({
              customId: `afk:mentions:${userId}`,
              label: t("afk:viewMentionsButton", { count: mentions.length }),
              emoji: Emojis.MAIL,
              style: ButtonStyle.Secondary,
            })
          ),
        ])
      : [];

    const welcomeCard = new ContainerBuilder();
    welcomeCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${Emojis.WAVE} ${t("afk:welcomeBackTitle")}**`,
      ),
    );
    welcomeCard.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    );
    welcomeCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t("afk:welcomeBackBody", { duration: afkDurationSince(since) }),
      ),
    );
    if (actionRows.length > 0) welcomeCard.addActionRowComponents(...actionRows);

    const sent = await message
      .reply({
        flags: MessageFlags.IsComponentsV2,
        components: [welcomeCard],
        allowedMentions: {},
      })
      .catch((err: unknown) => {
        logError("AFK: Welcome reply failed", err);
        return null;
      });

    if (sent) {
      await scheduleTask(
        "afk-delete-message",
        {
          channelId: sent.channelId,
          messageId: sent.id,
          clearMentions: { guildId, userId },
          scheduledFor: Date.now() + 20_000,
          catchUp: false,
        },
        20_000,
      ).catch((err: unknown) =>
        logError("AFK: Schedule welcome delete failed", err),
      );
    } else {
      await clearAfkMentions(guildId, userId).catch((err: unknown) =>
        logError("AFK: Clear mentions failed", err),
      );
    }
  }

  async #notifyMentioned(message: GuildMessage) {
    const claimedNotice = await claimAfkCooldown(
      AfkKeys.mentionCooldown(message.channelId),
      AfkMentionCooldownMs,
    );

    const mentionBase = {
      authorId: message.author.id,
      authorName: message.member?.displayName ?? message.author.username,
      channelId: message.channelId,
      messageId: message.id,
      ts: Math.floor(message.createdTimestamp / 1000),
    };

    interface AfkHit {
      userId: string;
      entry: NonNullable<Awaited<ReturnType<typeof getAfkEntry>>>;
    }
    const mentionedUsers = [...message.mentions.users.values()].filter(
      (user) => user.id !== message.author.id,
    );
    if (!mentionedUsers.length) return;

    const mentionedIds = mentionedUsers.map((u) => u.id);
    const afkMap = await getAfkEntriesBatch(message.guildId, mentionedIds);
    const hits: AfkHit[] = [];
    for (const userId of mentionedIds) {
      const entry = afkMap.get(userId);
      if (entry) {
        hits.push({ userId, entry });
      }
    }

    if (!hits.length) return;

    await addAfkMentionsBatch(
      message.guildId,
      hits.map(({ userId }) => ({ userId, mention: mentionBase })),
    ).catch((err: unknown) => logError("AFK: Batch mention write failed", err));

    if (!claimedNotice) return;

    const { userId, entry } = hits[0]!;
    const member = await message.guild.members
      .fetch(userId)
      .catch((err: unknown) => {
        logError("AFK: Fetch member failed", err);
        return null;
      });
    const name = member?.displayName.startsWith(NickPrefix)
      ? member.displayName.slice(NickPrefix.length)
      : (member?.displayName ?? userId);

    if (!message.channel.isSendable() || !canSendMessages(message)) return;
    const sent = await message
      .reply({
        ...makeCard(
          0,
          `${Emojis.AFK} ${name} is AFK`,
          `**Reason:** ${sanitizeReason(entry.reason)}\n**AFK for:** ${afkDurationSince(entry.since)}`,
        ),
        allowedMentions: { repliedUser: true },
      })
      .catch((err: unknown) => {
        logError("AFK: Mention reply failed", err);
        return null;
      });

    if (sent)
      await scheduleTask(
        "afk-delete-message",
        {
          channelId: sent.channelId,
          messageId: sent.id,
          scheduledFor: Date.now() + 600_000,
          catchUp: false,
        },
        600_000,
      ).catch((err: unknown) =>
        logError("AFK: Schedule mention delete failed", err),
      );
  }

  async #editNick(userId: string, fn: () => Promise<unknown>) {
    if (
      !(await claimAfkCooldown(
        AfkKeys.nickEditCooldown(userId),
        AfkNickEditCooldownMs,
      ))
    )
      return;
    await fn().catch((err: unknown) =>
      logError("AFK: Nickname edit failed", err),
    );
  }
}
