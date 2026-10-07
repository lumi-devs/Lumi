import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  PermissionFlagsBits,
  GuildMember,
  SlashCommandBuilder,
  User,
} from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
import type { LumiT } from "#lib/i18n/index.js";
import { makeCard } from "#lib/ui/cards.js";
import { resolveCardColor } from "#lib/utilities/config.js";

const KeyPermissions = [
  { flag: PermissionFlagsBits.Administrator, name: "Administrator" },
  { flag: PermissionFlagsBits.ManageGuild, name: "Manage Server" },
  { flag: PermissionFlagsBits.ManageRoles, name: "Manage Roles" },
  { flag: PermissionFlagsBits.ManageChannels, name: "Manage Channels" },
  { flag: PermissionFlagsBits.BanMembers, name: "Ban Members" },
  { flag: PermissionFlagsBits.KickMembers, name: "Kick Members" },
  { flag: PermissionFlagsBits.ManageMessages, name: "Manage Messages" },
  { flag: PermissionFlagsBits.ManageWebhooks, name: "Manage Webhooks" },
  { flag: PermissionFlagsBits.MentionEveryone, name: "Mention Everyone" },
];

function buildWhoisCard(
  user: User,
  member: GuildMember | null,
  guildId: string,
  t: LumiT,
) {
  const userTag =
    user.discriminator === "0"
      ? `@${user.username}`
      : `${user.username}#${user.discriminator}`;
  const botBadge = user.bot ? ` [BOT]` : "";

  const userSec =
    `${t("commands:whoisUserMention", { mention: user.toString() })}\n` +
    `${t("commands:whoisAccountId", { id: user.id })}\n` +
    `${t("commands:whoisCreatedAt", {
      relative: time(user.createdAt, TimestampStyles.RelativeTime),
      short: time(user.createdAt, TimestampStyles.ShortDate),
    })}`;

  const body = [userSec];

  let color = resolveCardColor("neutral");

  if (member) {
    color = member.displayColor || resolveCardColor("primary");
    const joinedSec = `${t("commands:whoisJoinedServer", {
      relative: time(member.joinedAt!, TimestampStyles.RelativeTime),
      short: time(member.joinedAt!, TimestampStyles.ShortDate),
    })}\n${
      member.premiumSince
        ? `${t("commands:whoisServerBoosting", {
            relative: time(member.premiumSince, TimestampStyles.RelativeTime),
          })}`
        : ""
    }`;

    body.push(`### ${t("commands:whoisMemberInfoTitle")}\n${joinedSec}`);

    const sortedRoles = member.roles.cache
      .filter((r) => r.id !== guildId)
      .sort((a, b) => b.position - a.position);

    let rolesText = t("commands:whoisRolesNone");
    if (sortedRoles.size > 0) {
      const mentions = sortedRoles.map((role) => role.toString());
      if (mentions.join(" ").length > 800) {
        let current = "";
        let count = 0;
        for (const mention of mentions) {
          if (`${current} ${mention}`.length > 750) break;
          current += (current ? " " : "") + mention;
          count++;
        }
        rolesText = t("commands:whoisRolesMore", {
          roles: current,
          count: sortedRoles.size - count,
        });
      } else {
        rolesText = mentions.join(" ");
      }
    }
    body.push(
      `### ${t("commands:whoisRolesTitle", { count: sortedRoles.size })}\n${rolesText}`,
    );

    let keyPermsText = t("commands:whoisPermissionsNone");
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      keyPermsText = t("commands:whoisPermissionsAdmin");
    } else {
      const perms = KeyPermissions.filter((p) =>
        member.permissions.has(p.flag),
      ).map((p) => p.name);
      if (perms.length > 0) {
        keyPermsText = perms.join(", ");
      }
    }
    body.push(`### ${t("commands:whoisPermissionsTitle")}\n${keyPermsText}`);
  }

  const avatarUrl = user.displayAvatarURL({ size: 4096, extension: "png" });
  const buttons = [
    new ButtonBuilder()
      .setLabel(t("commands:whoisViewProfile"))
      .setStyle(ButtonStyle.Link)
      .setURL(`discord://-/users/${user.id}`)
      .setEmoji({ name: "👤" }),
  ];

  if (avatarUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel(t("commands:whoisAvatarLink"))
        .setStyle(ButtonStyle.Link)
        .setURL(avatarUrl)
        .setEmoji({ name: "🖼️" }),
    );
  }

  const actionRows = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...buttons,
    ),
  ];

  return makeCard(color, `${userTag}${botBadge}`, body, { actionRows });
}

export const whoisDef: CommandDef = {
  name: "whois",
  aliases: ["userinfo", "user", "memberinfo"],
  description: "Displays information about a user or guild member.",
  guildOnly: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("whois");
    return (
      b
        .setName("whois")
        .setDescription("Displays information about a user or guild member.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user whose info to display (defaults to you).")
            .setRequired(false),
        )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    const t = await ctx.fetchT();
    if (ctx.isSlash) {
      const interaction: ChatInputCommandInteraction = ctx.interaction;
      const user = interaction.options.getUser("user") ?? interaction.user;
      const member =
        (interaction.options.getMember("user") as GuildMember | null) ??
        (await interaction.guild!.members.fetch(user.id).catch(() => null));
      const card = buildWhoisCard(user, member, interaction.guildId!, t);
      return ctx.reply(card, { ephemeral: false });
    }
    const message: Message = ctx.message;
    if (!message.channel.isSendable()) return;
    const user = (await ctx.getUser("user")) ?? message.author;
    const member = await message
      .guild!.members.fetch(user.id)
      .catch(() => null);
    const card = buildWhoisCard(user, member, message.guildId!, t);
    return ctx.reply(card, { ephemeral: false });
  },
};
