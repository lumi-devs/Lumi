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
import { createActionButton, buildSafeActionRows } from "#lib/utilities/panels.js";
import { BaseCommand, sendReply, fetchTyped } from "#lib/commands.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { LumiInfo } from "#lib/utilities/misc.js";
import { Emojis } from "#lib/utilities/assets.js";
import { BotConfig } from "#lib/utilities/config.js";
import { collectPingData } from "#modules/core/lib/ping-collect.js";
import { fmtMB } from "#modules/core/lib/ping-cards.js";
import {
  makeCard,
  ephemeralCard,
  formatStatusBadge,
  resolveCardColor,
} from "#lib/utilities/cards.js";

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

    const ageDays = LumiInfo.getAgeInDays();
    const ageText =
      ageDays === 0 ? t("core:today") : t("core:daysAgo", { count: ageDays });

    const serverCount = data.guilds;
    const userCount = data.users;
    const channelCount = data.channels;

    const fmtCount = (count: number) =>
      count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();

    const bootTime = new Date(Date.now() - data.uptime);
    const hostBootTime = new Date(Date.now() - data.osUptimeSecs * 1000);

    const tagline = t(LanguageKeys.Commands.AboutTagline);
    const instanceStatsHeader = t(LanguageKeys.Commands.AboutInstanceStats);
    const coreArchHeader = t(LanguageKeys.Commands.AboutCoreArch);

    const pingStatus =
      data.wsPing < 150 ? "success" : data.wsPing < 300 ? "warning" : "error";

    const body = [
      `${Emojis.BOT} **${tagline}**\n` +
        `${t("core:aboutUptime", { age: ageText })} — Codename **${LumiInfo.codename}**`,

      `### ${Emojis.ANALYTICS} ${instanceStatsHeader}\n` +
        `**${t("core:servers")}:** ${fmtCount(serverCount)}  •  **${t("core:members")}:** ${fmtCount(userCount)}  •  **${t("core:channels")}:** ${fmtCount(channelCount)}\n` +
        `**${t("core:uptime")}:** ${time(bootTime, TimestampStyles.RelativeTime)}  •  **${t("core:hostUptime")}:** ${time(hostBootTime, TimestampStyles.RelativeTime)}\n` +
        `**Ping:** ${formatStatusBadge(pingStatus, `${Math.round(data.wsPing)}ms`)}  •  **Memory:** ${fmtMB(data.rss)}  •  **CPU:** ${data.cpuPercent.toFixed(1)}%`,

      `### ${Emojis.GEAR} ${coreArchHeader}\n` +
        `**${t("core:lumiVersion")}:** v${LumiInfo.version}  •  **${t("core:runtimeEnvironment")}:** ${data.runtime}\n` +
        `**${t("core:coreLibraries")}:** discord.js v${data.djsVersion} · Sapphire v${data.sapphireVersion}\n` +
        `**${t("core:storageCache")}:** Prisma v${data.prismaVersion} · Redis v${data.redisVersion}\n` +
        `**${t("core:eventPipeline")}:** BullMQ`,

      `### ${Emojis.REPO} Codebase\n` +
        `**${data.codeLines.toLocaleString()}** lines of TypeScript across **${data.modules.length}** modules  •  **${data.depCount.toLocaleString()}** dependencies`,
    ];

    const buttons: ButtonBuilder[] = [];

    const supportServer = BotConfig.branding.links?.supportServer;
    if (supportServer) {
      buttons.push(createActionButton({ style: ButtonStyle.Link, label: t("core:supportServer"), url: supportServer, emoji: { name: "🆘" } }));
    }

    const githubUrl = BotConfig.branding.links?.github || LumiInfo.github;
    if (githubUrl) {
      buttons.push(createActionButton({ style: ButtonStyle.Link, label: t("core:github"), url: githubUrl, emoji: Emojis.parse(Emojis.custom("<:github:950888087188283422>", "🐙")) }));
    }

    const website = BotConfig.branding.links?.website;
    if (website) {
      buttons.push(createActionButton({ style: ButtonStyle.Link, label: t("core:website"), url: website, emoji: { name: "🌐" } }));
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

    if (inviteUrl) {
      buttons.push(createActionButton({ style: ButtonStyle.Link, label: t("core:inviteBot"), url: inviteUrl, emoji: { name: "🎉" } }));
    }

    const actionRows = buttons.length > 0 ? buildSafeActionRows([new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)]) : [];

    return makeCard(
      resolveCardColor("primary"),
      t("core:commandCenter"),
      body,
      {
        thumbnailUrl: data.avatarURL,
        actionRows,
      },
    );
  }
}
