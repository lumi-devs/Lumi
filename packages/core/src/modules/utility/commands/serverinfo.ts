import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  ChannelType,
  SlashCommandBuilder,
} from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import type { LumiT } from "@lumi/lib/i18n/index.js";
import { makeCard } from "@lumi/lib/ui/cards.js";
import { resolveCardColor } from "@lumi/lib/ui/palette.js";

async function buildServerCard(
  ctx: ChatInputCommandInteraction | Message,
  t: LumiT,
) {
  const guild = ctx.guild!;

  const owner = await guild.fetchOwner();
  const channels = guild.channels.cache;
  const textChannels = channels.filter(
    (c) => c.type === ChannelType.GuildText,
  ).size;
  const voiceChannels = channels.filter(
    (c) => c.type === ChannelType.GuildVoice,
  ).size;
  const categoryChannels = channels.filter(
    (c) => c.type === ChannelType.GuildCategory,
  ).size;

  const emojiCount = guild.emojis.cache.size;
  const roleCount = guild.roles.cache.size;

  const body = [
    `${t("commands:serverinfoOwner", { owner: owner.user.toString(), id: owner.id })}\n` +
      `${t("commands:serverinfoCreatedAt", {
        relative: time(guild.createdAt, TimestampStyles.RelativeTime),
        short: time(guild.createdAt, TimestampStyles.ShortDate),
      })}\n` +
      `${t("commands:serverinfoGuildId", { id: guild.id })}`,

    `### 👥 ${t("commands:serverinfoMembersTitle")}\n` +
      `${t("commands:serverinfoTotalMembers", { count: guild.memberCount })}\n${
        guild.premiumSubscriptionCount
          ? `${t("commands:serverinfoServerBoosts", {
              count: guild.premiumSubscriptionCount,
              tier: guild.premiumTier,
            })}\n`
          : ""
      }`,

    `### 🌐 ${t("commands:serverinfoChannelsTitle")}\n` +
      `${t("commands:serverinfoTextChannels", { count: textChannels })}\n` +
      `${t("commands:serverinfoVoiceChannels", { count: voiceChannels })}\n` +
      `${t("commands:serverinfoCategories", { count: categoryChannels })}\n` +
      `${t("commands:serverinfoTotalChannels", { count: channels.size })}`,

    `### ⚙️ ${t("commands:serverinfoFeaturesTitle")}\n` +
      `${t("commands:serverinfoRoles", { count: roleCount })}\n` +
      `${t("commands:serverinfoEmojis", { count: emojiCount })}\n` +
      `${t("commands:serverinfoVerificationLevel", { level: guild.verificationLevel })}`,
  ];

  const buttons = [];
  const iconUrl = guild.iconURL({ size: 4096, extension: "png" });
  if (iconUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel(t("commands:serverinfoIconLink"))
        .setStyle(ButtonStyle.Link)
        .setURL(iconUrl)
        .setEmoji({ name: "🖼️" }),
    );
  }

  const actionRows =
    buttons.length > 0
      ? [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            ...buttons,
          ),
        ]
      : undefined;

  return makeCard(
    resolveCardColor("primary"),
    guild.name,
    body,
    {
      actionRows,
    },
  );
}

export const serverinfoDef: CommandDef = {
  name: "serverinfo",
  aliases: ["sinfo", "guildinfo", "server"],
  description: "Displays detailed information about this server.",
  guildOnly: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("serverinfo");
    return (
      b
        .setName("serverinfo")
        .setDescription("Displays detailed information about this server.")
    );
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    const card = await buildServerCard(ctx.source, t);
    return ctx.reply(card, { ephemeral: false });
  },
};
