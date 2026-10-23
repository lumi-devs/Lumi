import {
  ButtonStyle,
  OAuth2Scopes,
  PermissionFlagsBits,
  SlashCommandBuilder,
  version as djsVersion,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import {
  createActionButton,
  makeCard,
  resolveCardColor,
  row,
} from "@lumi/ui";
import { version } from "../paths.ts";
import { collectPingStats } from "./ping.ts";

const DocsUrl = "https://lumi-devs.github.io/Lumi-docs";
const PrivacyUrl = "https://lumi-devs.github.io/Lumi-docs/reference/data-and-privacy";
const LicenseUrl = "https://github.com/lumi-devs/Lumi/blob/main/LICENSE";

function fmtCount(count: number): string {
  return count >= 1_000 ? `${(count / 1_000).toFixed(1)}K` : count.toString();
}

function fmtMemory(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uptimeLabel(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export const about: CommandDef = {
  name: "about",
  description: "Show Lumi's version, statistics, and project links.",
  module: null,
  prefix: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("about")
      .setDescription("Show Lumi's version, statistics, and project links."),
  async run(ctx) {
    await ctx.defer();
    const data = await collectPingStats(ctx.services);

    const body = [
      "# Lumi",
      "Lumi is a self-hosted Discord administration platform built for communities that want full control. Moderation, utilities, add-ons, and permissions all run from one process you host yourself.",
      [
        "### 📊 Instance",
        `-# **${fmtCount(data.guilds)}** servers · **${fmtCount(data.users)}** members · **${fmtCount(data.shards.length)}** shards`,
        `-# Uptime \`${uptimeLabel(data.uptime)}\` · Gateway \`${Math.round(data.wsPing)}ms\` · Memory \`${fmtMemory(data.rss)}\``,
      ].join("\n"),
      [
        "### ⚙️ Runtime",
        `_Lumi_ v${version} · _Bun_ v${Bun.version} · _discord.js_ v${djsVersion}`,
        `**${data.modulesCount}** modules · **${data.commandsCount}** commands · **${data.cpuCores}** CPU cores`,
      ].join("\n"),
      "-# Self-hosted, open source, and built to stay up.",
    ];

    const inviteUrl = ctx.guild
      ? ctx.services.client.generateInvite({
          scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
          permissions: [
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.ChangeNickname,
            PermissionFlagsBits.DeafenMembers,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageNicknames,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageThreads,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.UseExternalEmojis,
            PermissionFlagsBits.ViewChannel,
          ],
        })
      : null;

    const links = [createActionButton({ style: ButtonStyle.Link, label: "Documentation", url: DocsUrl })];
    if (inviteUrl) links.push(createActionButton({ style: ButtonStyle.Link, label: "Invite", url: inviteUrl }));
    const legal = [
      createActionButton({ style: ButtonStyle.Link, label: "Privacy", url: PrivacyUrl }),
      createActionButton({ style: ButtonStyle.Link, label: "License", url: LicenseUrl }),
    ];

    return ctx.reply(
      makeCard(resolveCardColor("primary"), "", body, {
        hideTitle: true,
        thumbnailUrl: data.avatarURL ?? undefined,
        actionRows: [row(...links), row(...legal)],
        separatorAboveActionRows: true,
      }),
    );
  },
};
