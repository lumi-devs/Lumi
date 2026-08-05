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
import { logError } from "#lib/utilities/errors.js";
import { canSendMessages } from "#lib/utilities/misc.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { AfkKeys } from "../keys.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  AFK_MENTION_COOLDOWN_MS,
  AFK_NICK_EDIT_COOLDOWN_MS,
  AFK_WELCOME_COOLDOWN_MS,
  NICK_PREFIX,
  afkDurationSince,
  sanitizeReason,
} from "../index.js";
import {
  getAfkEntry,
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
      const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
      const isCommand = prefixList.some((p) => message.content.startsWith(p));

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

    if (message.member?.displayName.startsWith(NICK_PREFIX)) {
      const newNick = message.member.displayName
        .slice(NICK_PREFIX.length)
        .trim();
      void this.#editNick(userId, () =>
        message.member!.setNickname(newNick || null),
      );
    }

    if (
      !(await claimAfkCooldown(
        AfkKeys.welcomeCooldown(channelId, userId),
        AFK_WELCOME_COOLDOWN_MS,
      ))
    )
      return;
    if (!message.channel.isSendable() || !canSendMessages(message)) return;

    const t = await fetchTyped(message);

    const row = mentions.length
      ? new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`afk:mentions:${userId}`)
            .setLabel(t("afk:viewMentionsButton", { count: mentions.length }))
            .setEmoji(Emojis.parse(Emojis.MAIL))
            .setStyle(ButtonStyle.Secondary),
        )
      : null;

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
    if (row) welcomeCard.addActionRowComponents(row);

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
    // Claimed up front rather than set after the reply: two mentioning
    // messages in the same channel are handled concurrently and would both
    // pass a read-only cooldown check.
    const claimedNotice = await claimAfkCooldown(
      AfkKeys.mentionCooldown(message.channelId),
      AFK_MENTION_COOLDOWN_MS,
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
    const hits: AfkHit[] = [];
    for (const user of message.mentions.users.values()) {
      if (user.id === message.author.id) continue;
      const entry = await getAfkEntry(message.guildId, user.id);
      if (!entry) continue;
      hits.push({ userId: user.id, entry });
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
    const name = member?.displayName.startsWith(NICK_PREFIX)
      ? member.displayName.slice(NICK_PREFIX.length)
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
        AFK_NICK_EDIT_COOLDOWN_MS,
      ))
    )
      return;
    await fn().catch((err: unknown) =>
      logError("AFK: Nickname edit failed", err),
    );
  }
}
