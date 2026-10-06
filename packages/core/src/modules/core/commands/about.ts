import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  OAuth2Scopes,
  PermissionFlagsBits,
} from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { createActionButton, buildSafeActionRows } from "#lib/ui/panels.js";
import { BaseCommand, sendReply, fetchTyped } from "#lib/commands.js";
import { LumiInfo } from "#lib/utilities/misc.js";
import { BotConfig } from "#lib/utilities/config.js";
import { collectPingData } from "../services/ping-collect.js";
import { fmtMB } from "../ui/ping-cards.js";
import { makeCard, ephemeralCard } from "#lib/ui/cards.js";
import { resolveCardColor } from "#lib/utilities/config.js";

@ApplyOptions<Command.Options>({
  name: "about",
  aliases: ["info", "stats", "botinfo"],
  description:
    "Display detailed information, statistics, and architecture of the Lumi bot.",
})
export class AboutCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const card = await this.buildAboutCard(interaction);
    await sendReply(interaction, ephemeralCard(card));
  }

  public override async messageRun(message: Message) {
    if (!message.channel.isSendable()) return;
    const card = await this.buildAboutCard(message);
    await message.reply({
      ...card,
    });
  }

  private async buildAboutCard(target: ChatInputCommandInteraction | Message) {
    const t = await fetchTyped(target);
    const data = await collectPingData();

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
      "Lumi is a powerful, self-hosted Discord administration platform designed for communities that demand full control and rock-solid reliability. Powered by TypeScript, Bun, and an isolated microservices topology, Lumi guarantees instant command responses, modular capability scaling, and enterprise-grade uptime for your server.",

      `### 📊 ${instanceStatsHeader}\n` +
        `**${t("core:servers")}:** ${fmtCount(serverCount)}  •  **${t("core:members")}:** ${fmtCount(userCount)}  •  **${t("core:channels")}:** ${fmtCount(channelCount)}\n` +
        `**${t("core:uptime")}:** ${time(bootTime, TimestampStyles.RelativeTime)}  •  **${t("core:hostUptime")}:** ${time(hostBootTime, TimestampStyles.RelativeTime)}\n` +
        `**Gateway:** \`${Math.round(data.wsPing)}ms\`  •  **Memory:** ${fmtMB(data.rss)}  •  **CPU:** ${data.cpuPercent.toFixed(1)}%`,

      `### ⚙️ ${coreArchHeader}\n` +
        `**Core:** discord.js v${data.djsVersion} · Sapphire v${data.sapphireVersion}\n` +
        `**Storage:** PostgreSQL 18 · Valkey v${data.valkeyVersion}\n` +
        `**Engine:** ${data.runtime} · BullMQ`,

      `### 📦 Codebase\n` +
        `**${data.codeLines.toLocaleString()}** lines of TypeScript across **${data.modules.length}** modules  •  **${data.depCount.toLocaleString()}** dependencies`,
    ];

    const row1Buttons: ButtonBuilder[] = [];

    const supportServer = BotConfig.branding.links?.supportServer;
    if (supportServer) {
      row1Buttons.push(createActionButton({ style: ButtonStyle.Link, label: t("core:supportServer"), url: supportServer }));
    }

    const githubUrl = BotConfig.branding.links?.github || LumiInfo.github;
    if (githubUrl) {
      row1Buttons.push(createActionButton({ style: ButtonStyle.Link, label: t("core:github"), url: githubUrl }));
    }

    const website = BotConfig.branding.links?.website || "https://lumi-devs.github.io/Lumi-docs";
    if (website) {
      row1Buttons.push(createActionButton({ style: ButtonStyle.Link, label: "Documentation", url: website }));
    }

    const inviteUrl = this.container.client.generateInvite({
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
        actionRows,
      },
    );
  }
}
