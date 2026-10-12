import type { Container } from "#src/lib/Services.js";
import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  OAuth2Scopes,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { createActionButton, buildSafeActionRows } from "#src/lib/ui/Panels.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { LumiInfo } from "#src/lib/utilities/Version.js";
import { collectPingData } from "#src/modules/core/services/PingCollect.js";
import { fmtMB } from "#src/modules/core/ui/PingCards.js";
import { makeCard } from "#src/lib/ui/Cards.js";
import { resolveCardColor } from "#src/lib/ui/Palette.js";

async function buildAboutCard(
  services: Container,
  target: ChatInputCommandInteraction | Message,
) {
  const t = await fetchTyped(target);
  const data = await collectPingData(services);

  const serverCount = data.guilds;
  const userCount = data.users;
  const channelCount = data.channels;

  const fmtCount = (count: number) =>
    count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();

  const bootTime = new Date(Date.now() - data.uptime);
  const hostBootTime = new Date(Date.now() - data.osUptimeSecs * 1000);

  const instanceStatsHeader = t("commands:aboutInstanceStats");
  const coreArchHeader = t("commands:aboutCoreArch");

  const body = [
    `# __Lumi__\n\n` +
      `Lumi is a powerful, self-hosted Discord administration platform designed for communities that demand full control and rock-solid reliability. Powered by TypeScript and Bun. Lumi guarantees instant command responses, modular capability, and enterprise-grade uptime for your server. The all-in-one administration platform you host yourself - moderation, leveling, economy, and logging, engineered for reliability.`,

    `### 📊 __${instanceStatsHeader}__\n` +
      `-# ${fmtCount(serverCount)} ${t("core:servers")} · ${fmtCount(userCount)} ${t("core:members")} · ${fmtCount(channelCount)} ${t("core:channels")}\n` +
      `-# ${t("core:uptime")} ${time(bootTime, TimestampStyles.RelativeTime)} (${t("core:hostUptime")} ${time(hostBootTime, TimestampStyles.RelativeTime)})\n` +
      `-# Gateway \`${Math.round(data.wsPing)}ms\` · Memory \`${fmtMB(data.rss)}\` · CPU \`${data.cpuPercent.toFixed(1)}%\``,

    `### ⚙️ __${coreArchHeader}__\n` +
      `_Lumi version_ v${LumiInfo.version}\n` +
      `*Bun* v${data.runtime.replace(/^Bun v/, "")} · *discord.js* v${data.djsVersion}\n` +
      `*PostgreSQL* 18 · *Valkey* v${data.valkeyVersion}`,

    `### 📦 __Codebase__\n` +
      `**${data.codeLines.toLocaleString()}** lines of TypeScript · **${data.modules.length}** modules · **${data.depCount.toLocaleString()}** dependencies\n` +
      `-# *Self-hosted, open source, and allergic to downtime.*`,
  ];

  const row1Buttons: ButtonBuilder[] = [];

  const githubUrl = LumiInfo.github;
  if (githubUrl) {
    row1Buttons.push(createActionButton({ style: ButtonStyle.Link, label: "Source Code", url: githubUrl }));
  }

  const website = "https://lumi-devs.github.io/Lumi-docs";
  row1Buttons.push(createActionButton({ style: ButtonStyle.Link, label: "Documentation", url: website }));

  const inviteUrl = services.client.generateInvite({
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
  });

  const row2Buttons: ButtonBuilder[] = [];
  if (inviteUrl) {
    row2Buttons.push(
      createActionButton({
        style: ButtonStyle.Link,
        label: "Invite",
        url: inviteUrl,
      }),
    );
  }
  row2Buttons.push(
    createActionButton({
      style: ButtonStyle.Link,
      label: "Privacy Policy",
      url: "https://lumi-devs.github.io/Lumi-docs/reference/data-and-privacy",
    }),
    createActionButton({
      style: ButtonStyle.Link,
      label: "Terms of Service",
      url: "https://github.com/lumi-devs/Lumi/blob/main/LICENSE",
    }),
  );

  const actionRows = buildSafeActionRows([
    new ActionRowBuilder<ButtonBuilder>().addComponents(row1Buttons),
    new ActionRowBuilder<ButtonBuilder>().addComponents(row2Buttons),
  ]);

  return makeCard(
    resolveCardColor("primary"),
    "",
    body,
    {
      hideTitle: true,
      noAccent: true,
      thumbnailUrl: data.avatarURL,
      separatorAboveActionRows: true,
      actionRows,
    },
  );
}

export const aboutDef: CommandDef = {
  name: "about",
  aliases: ["info", "stats", "botinfo"],
  description:
    "Display detailed information, statistics, and architecture of the Lumi bot.",
  build: () =>
    new SlashCommandBuilder()
      .setName("about")
      .setDescription(
        "Display detailed information, statistics, and architecture of the Lumi bot.",
      ),
  run: async (ctx: CommandContext) => {
    const card = await buildAboutCard(ctx.services, ctx.source);
    return ctx.reply(card);
  },
};
