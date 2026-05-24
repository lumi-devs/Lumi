import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  MessageFlags,
  SeparatorSpacingSize,
  type Message,
  PermissionsBitField,
} from "discord.js";
import { EmberColors } from "#utilities/branding.js";
import { makeCard } from "#utilities/cards.js";
import { logError } from "#utilities/errors.js";
import { RedisKeys } from "#database/redis.js";
import { EmberEmojis } from "#utilities/assets.js";
import {
  AFK_MENTION_COOLDOWN_MS,
  AFK_NICK_EDIT_COOLDOWN_MS,
  AFK_WELCOME_COOLDOWN_MS,
  NICK_PREFIX,
  afkDurationSince,
  isAfkEnabled,
  sanitizeReason,
} from "../index.js";
import {
  getAfkEntry,
  isAfkOnCooldown,
  getAfkMentions,
  clearAfkEntry,
  setAfkCooldown,
  clearAfkMentions,
  addAfkMention,
} from "../data/afk.js";

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export default class AFKMessageCreateListener extends Listener<
  typeof Events.MessageCreate
> {
  public async run(message: Message) {
    if (!message.inGuild() || message.author.bot) return;
    if (!(await isAfkEnabled(message.guildId))) return;

    const entry = await getAfkEntry(message.guildId, message.author.id);
    if (entry) {
      // Don't remove AFK if it's a command
      const prefixes = await this.container.client.fetchPrefix(message);
      const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
      const isCommand = prefixList.some((p) => message.content.startsWith(p));

      if (
        !isCommand &&
        !(await isAfkOnCooldown(
          RedisKeys.afkRemovalCooldown(message.guildId, message.author.id),
        ))
      ) {
        this.container.logger.debug(
          `[AFK] ${EmberEmojis.AFK} Removing AFK for ${message.author.tag} in ${message.guild.name}`,
        );
        await this.#removeAfk(message, entry.since);
      }
    }

    if (message.mentions.users.size) await this.#notifyMentioned(message);
  }

  async #removeAfk(message: Message<true>, since: Date) {
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

    if (await isAfkOnCooldown(RedisKeys.afkWelcomeCooldown(channelId, userId)))
      return;
    await setAfkCooldown(
      RedisKeys.afkWelcomeCooldown(channelId, userId),
      AFK_WELCOME_COOLDOWN_MS,
    );
    if (!message.channel.isSendable() || !this.#canSpeak(message)) return;

    const row = mentions.length
      ? new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`afk:mentions:${guildId}:${userId}`)
            .setLabel(`View Mentions (${mentions.length})`)
            .setEmoji({ name: EmberEmojis.MAIL })
            .setStyle(ButtonStyle.Secondary),
        )
      : null;

    const welcomeCard = new ContainerBuilder();
    welcomeCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${EmberEmojis.WAVE} Welcome Back!**`,
      ),
    );
    welcomeCard.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    );
    welcomeCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `AFK removed.\nAFK for **${afkDurationSince(since)}**.`,
      ),
    );
    if (row) welcomeCard.addActionRowComponents(row);

    const sent = await message
      .reply({
        flags: MessageFlags.IsComponentsV2 as number,
        components: [welcomeCard],
        allowedMentions: {},
      })
      .catch((err: unknown) => {
        logError("AFK: Welcome reply failed", err);
        return null;
      });

    if (sent) {
      setTimeout(() => {
        void sent.delete().catch((err: any) => {
          if (err?.code === 10008 || err?.code === 10003) return;
          logError("AFK: Delete welcome msg failed", err);
        });
        void clearAfkMentions(guildId, userId).catch((err: unknown) =>
          logError("AFK: Clear mentions failed", err),
        );
      }, 20_000);
    } else {
      await clearAfkMentions(guildId, userId).catch((err: unknown) =>
        logError("AFK: Clear mentions failed", err),
      );
    }
  }

  async #notifyMentioned(message: Message<true>) {
    const onCooldown = await isAfkOnCooldown(
      RedisKeys.afkMentionCooldown(message.channelId),
    );
    let first = false;

    for (const user of message.mentions.users.values()) {
      if (user.id === message.author.id) continue;

      const entry = await getAfkEntry(message.guildId, user.id);
      if (!entry) continue;

      await addAfkMention(message.guildId, user.id, {
        authorId: message.author.id,
        authorName: message.member?.displayName ?? message.author.username,
        channelId: message.channelId,
        messageId: message.id,
        ts: Math.floor(message.createdTimestamp / 1000),
      });

      if (first || onCooldown) continue;

      const member = await message.guild.members
        .fetch(user.id)
        .catch((err: unknown) => {
          logError("AFK: Fetch member failed", err);
          return null;
        });
      const name = member?.displayName.startsWith(NICK_PREFIX)
        ? member.displayName.slice(NICK_PREFIX.length)
        : (member?.displayName ?? user.username);

      if (!message.channel.isSendable() || !this.#canSpeak(message)) continue;
      const sent = await message
        .reply({
          ...makeCard(
            EmberColors.GOLD,
            `${EmberEmojis.AFK} ${name} is AFK`,
            `**Reason:** ${sanitizeReason(entry.reason)}\n**AFK for:** ${afkDurationSince(entry.since)}`,
          ),
          allowedMentions: { repliedUser: true },
        })
        .catch((err: unknown) => {
          logError("AFK: Mention reply failed", err);
          return null;
        });

      if (sent)
        setTimeout(
          () =>
            sent.delete().catch((err: any) => {
              if (err?.code === 10008 || err?.code === 10003) return;
              logError("AFK: Delete mention reply failed", err);
            }),
          600_000,
        );
      await setAfkCooldown(
        RedisKeys.afkMentionCooldown(message.channelId),
        AFK_MENTION_COOLDOWN_MS,
      );
      first = true;
    }
  }

  #canSpeak(message: Message<true>) {
    const { me } = message.guild.members;
    if (!me) return false;
    return (
      message.channel
        .permissionsFor(me)
        ?.has(PermissionsBitField.Flags.SendMessages) ?? false
    );
  }

  async #editNick(userId: string, fn: () => Promise<unknown>) {
    if (await isAfkOnCooldown(RedisKeys.afkNickEditCooldown(userId))) return;
    await setAfkCooldown(
      RedisKeys.afkNickEditCooldown(userId),
      AFK_NICK_EDIT_COOLDOWN_MS,
    );
    await fn().catch((err: unknown) =>
      logError("AFK: Nickname edit failed", err),
    );
  }
}
