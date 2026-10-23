import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  Events,
  MessageFlags,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type Message,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { SeparatorBuilder } from "@discordjs/builders";
import type { ListenerDef, LumiServices } from "@lumi/bot-kit";
import { claim } from "@lumi/redis";
import { componentEmoji, makeCard } from "@lumi/ui";
import {
  afkSince,
  getAfkMentions,
  NickPrefix,
  recordAfkMention,
  stripNickPrefix,
} from "./service.ts";

async function isCommand(services: LumiServices, message: Message<true>): Promise<boolean> {
  const guild = await services.db.guild.get(message.guildId);
  const prefix = guild?.prefix ?? services.runtime.defaultPrefix;
  if (!message.content.startsWith(prefix)) return false;
  const name = message.content.slice(prefix.length).trim().split(/\s+/)[0];
  return name !== undefined && services.modules.command(name)?.prefix === true;
}

export const afkMessageListener: ListenerDef<Events.MessageCreate> = {
  name: "afk-message",
  event: Events.MessageCreate,
  module: "afk",
  async execute(services, message) {
    if (!message.inGuild() || message.author.bot || message.system) return;
    const { guildId, channelId } = message;
    if (!(await services.modules.isEnabled(guildId, "afk"))) return;
    const userId = message.author.id;

    // Check if author was AFK
    const ownEntry = await services.db.afk.findEntry(guildId, userId);
    if (ownEntry && !(await isCommand(services, message))) {
      await services.db.afk.deleteEntry(guildId, userId);

      if (message.member?.displayName.startsWith(NickPrefix)) {
        const clean = stripNickPrefix(message.member.displayName);
        if (message.member.manageable) {
          await message.member.setNickname(clean).catch(() => null);
        }
      }

      const welcomeCooldown = await claim(
        services.redis,
        services.keys.cooldown("afk:welcome", `${channelId}:${userId}`),
        5_000,
      );

      if (welcomeCooldown && message.channel.isSendable()) {
        const mentions = await getAfkMentions(services, guildId, userId);
        const actionRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

        if (mentions.length > 0) {
          actionRows.push(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`afk:mentions:${userId}:0`)
                .setLabel(`View Mentions (${mentions.length})`)
                .setEmoji(componentEmoji("📬"))
                .setStyle(ButtonStyle.Secondary),
            ),
          );
        }

        const welcomeCard = new ContainerBuilder();
        welcomeCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent("**👋 Welcome Back!**"),
        );
        welcomeCard.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
        );
        welcomeCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`AFK removed.\nAFK for **${afkSince(ownEntry)}**.`),
        );
        if (actionRows.length > 0) {
          welcomeCard.addActionRowComponents(...actionRows);
        }

        await message
          .reply({
            flags: MessageFlags.IsComponentsV2,
            components: [welcomeCard],
            allowedMentions: {},
          })
          .catch(() => null);
      }
    }

    // Check if others were mentioned
    const mentioned = message.mentions.users.filter((user) => user.id !== userId && !user.bot);
    if (mentioned.size === 0) return;

    const entries = await services.db.afk.findEntries(guildId, [...mentioned.keys()]);
    if (entries.length === 0) return;

    const mentionBase = {
      authorId: message.author.id,
      channelId: message.channelId,
      messageId: message.id,
      ts: Math.floor(message.createdTimestamp / 1000),
    };

    // Record mentions for all matched AFK users
    for (const entry of entries) {
      await recordAfkMention(services, guildId, entry.userId, mentionBase);
    }

    const claimed = await claim(
      services.redis,
      services.keys.cooldown("afk:mention", channelId),
      5_000,
    );
    if (!claimed || !message.channel.isSendable()) return;

    const firstEntry = entries[0];
    if (!firstEntry) return;

    const member = await message.guild.members.fetch(firstEntry.userId).catch(() => null);
    const name = member?.displayName.startsWith(NickPrefix)
      ? member.displayName.slice(NickPrefix.length)
      : (member?.displayName ?? firstEntry.userId);

    const reply = await message
      .reply({
        ...makeCard(
          0,
          `💤 ${name} is AFK`,
          `**Reason:** ${firstEntry.reason}\n**AFK for:** ${afkSince(firstEntry)}`,
        ),
        allowedMentions: {},
      })
      .catch(() => null);

    if (reply) {
      setTimeout(() => {
        reply.delete().catch(() => null);
      }, 15_000);
    }
  },
};
