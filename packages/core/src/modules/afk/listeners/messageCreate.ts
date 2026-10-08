import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "@discordjs/builders";
import type { Container } from "#lib/services.js";
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import { LumiEvents } from "#lib/types/common.js";
import type { GuildMessage } from "#lib/types/common.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import { makeCard } from "#lib/ui/cards.js";
import { createActionButton, buildSafeActionRows } from "#lib/ui/panels.js";
import { logError } from "#lib/utilities/errors.js";
import { canSendMessages } from "#lib/utilities/misc.js";
import { scheduleTask } from "#lib/scheduler/schedule.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  AfkKeys,
  AfkMentionCooldownMs,
  AfkMentionsId,
  AfkNickEditCooldownMs,
  AfkWelcomeCooldownMs,
  NickPrefix,
} from "../constants.js";
import { afkDurationSince, sanitizeReason } from "@lumi/application/services/afk/format.js";
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

import { fetchTyped } from "#lib/i18n/index.js";

const afkMessageCreate = defineListener({
  name: "afkMessageCreate",
  event: LumiEvents.GuildUserMessage,
  module: "afk",
  async execute(services: Container, message: GuildMessage): Promise<void> {
    const entry = await getAfkEntry(services, message.guildId, message.author.id);
    if (
      entry &&
      !(await isAfkOnCooldown(
        services,
        AfkKeys.removalCooldown(message.guildId, message.author.id),
      ))
    ) {
      await removeAfk(services, message, entry.since);
    }

    if (message.mentions.users.size) await notifyMentioned(services, message);
  },
});

export default afkMessageCreate;

async function removeAfk(services: Container, message: GuildMessage, since: Date) {
    const { guildId, channelId } = message;
    const userId = message.author.id;

    const mentions = await getAfkMentions(services, guildId, userId);
    await clearAfkEntry(services, guildId, userId).catch((err: unknown) =>
      logError("AFK: Clear entry failed", err),
    );

    if (message.member?.displayName.startsWith(NickPrefix)) {
      const newNick = message.member.displayName
        .slice(NickPrefix.length)
        .trim();
      void editNick(services, userId, () =>
        message.member!.setNickname(newNick || null),
      );
    }

    if (
      !(await claimAfkCooldown(
        services,
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
              customId: AfkMentionsId.build({ userId, page: "0" }),
              label: t("afk:viewMentionsButton", { count: mentions.length }),
              emoji: Emojis.Mail,
              style: ButtonStyle.Secondary,
            })
          ),
        ])
      : [];

    const welcomeCard = new ContainerBuilder();
    welcomeCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${Emojis.Wave} ${t("afk:welcomeBackTitle")}**`,
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
      await clearAfkMentions(services, guildId, userId).catch((err: unknown) =>
        logError("AFK: Clear mentions failed", err),
      );
    }
  }

async function notifyMentioned(services: Container, message: GuildMessage) {
    const claimedNotice = await claimAfkCooldown(
      services,
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
    const afkMap = await getAfkEntriesBatch(services, message.guildId, mentionedIds);
    const hits: AfkHit[] = [];
    for (const userId of mentionedIds) {
      const entry = afkMap.get(userId);
      if (entry) {
        hits.push({ userId, entry });
      }
    }

    if (!hits.length) return;

    await addAfkMentionsBatch(
      services,
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
    const t = await fetchTyped(message);
    const sent = await message
      .reply({
        ...makeCard(
          0,
          `${Emojis.Afk} ${t("afk:isAfkTitle", { name })}`,
          t("afk:isAfkBody", {
            reason: sanitizeReason(entry.reason),
            duration: afkDurationSince(entry.since),
          }),
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

async function editNick(services: Container, userId: string, fn: () => Promise<unknown>) {
    if (
      !(await claimAfkCooldown(
        services,
        AfkKeys.nickEditCooldown(userId),
        AfkNickEditCooldownMs,
      ))
    )
      return;
    await fn().catch((err: unknown) =>
      logError("AFK: Nickname edit failed", err),
    );
}
