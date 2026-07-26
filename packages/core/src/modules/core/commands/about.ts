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
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { BaseCommand, sendReply, fetchTyped } from "#lib/commands.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { LumiInfo } from "#lib/utilities/misc.js";
import { Emojis } from "#lib/utilities/assets.js";
import { BotConfig } from "#lib/utilities/config.js";
import { collectPingData } from "#modules/core/lib/ping-collect.js";
import { makeCard, ephemeralCard } from "#lib/utilities/cards.js";

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
      ageDays === 0
        ? t("core:today")
        : t("core:daysAgo", { count: ageDays });

    const serverCount = data.guilds;
    const userCount = data.users;
    const channelCount = data.channels;

    const fmtCount = (count: number) =>
      count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();

    const bootTime = new Date(Date.now() - data.uptime);
    const hostBootTime = new Date(Date.now() - data.osUptimeSecs * 1000);

    const loadedModulesList = data.modules
      .map((m) => m.meta.displayName)
      .join(", ");

    const tagline = t(LanguageKeys.Commands.AboutTagline);
    const instanceStatsHeader = t(LanguageKeys.Commands.AboutInstanceStats);
    const coreArchHeader = t(LanguageKeys.Commands.AboutCoreArch);
    const loadedModulesHeader = t(LanguageKeys.Commands.AboutLoadedModules);

    const body = [
      `${Emojis.BOT} **${tagline}** (Codename: *${LumiInfo.codename}*)\n` +
        t("core:aboutTagline", { age: ageText }),

      `### ${Emojis.ANALYTICS} ${instanceStatsHeader}\n` +
        `> **${t("core:uptime")}**\n> ┕ ${time(bootTime, TimestampStyles.RelativeTime)}\n` +
        `> **${t("core:hostUptime")}**\n> ┕ ${time(hostBootTime, TimestampStyles.RelativeTime)}\n` +
        `> **${t("core:servers")}**\n> ┕ ***${fmtCount(serverCount)}***\n` +
        `> **${t("core:members")}**\n> ┕ ***${fmtCount(userCount)}***\n` +
        `> **${t("core:channels")}**\n> ┕ ***${fmtCount(channelCount)}***`,

      `### ${Emojis.GEAR} ${coreArchHeader}\n` +
        `> **${t("core:lumiVersion")}**\n> ┕ ***v${LumiInfo.version}***\n` +
        `> **${t("core:runtimeEnvironment")}**\n> ┕ ***${data.runtime}***\n` +
        `> **${t("core:coreLibraries")}**\n> ┕ ***discord.js v${data.djsVersion} | Sapphire v${data.sapphireVersion}***\n` +
        `> **${t("core:storageCache")}**\n> ┕ ***Prisma v${data.prismaVersion} | Redis v${data.redisVersion}***\n` +
        `> **${t("core:eventPipeline")}**\n> ┕ ***RabbitMQ (${data.rabbitConnected ? t("core:connected") : t("core:offline")}) | BullMQ***`,

      `### ${Emojis.REPO} ${loadedModulesHeader}\n` +
        `┕ *${loadedModulesList || t("core:none")}*`,
    ];

    const buttons: ButtonBuilder[] = [];

    const supportServer = BotConfig.branding.links?.supportServer;
    if (supportServer) {
      buttons.push(
        new ButtonBuilder()
          .setLabel(t("core:supportServer"))
          .setStyle(ButtonStyle.Link)
          .setURL(supportServer)
          .setEmoji({ name: "🆘" }),
      );
    }

    const githubUrl = BotConfig.branding.links?.github || LumiInfo.github;
    if (githubUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel(t("core:github"))
          .setStyle(ButtonStyle.Link)
          .setURL(githubUrl)
          .setEmoji(
            Emojis.parse(Emojis.custom("<:github:950888087188283422>", "🐙")),
          ),
      );
    }

    const website = BotConfig.branding.links?.website;
    if (website) {
      buttons.push(
        new ButtonBuilder()
          .setLabel(t("core:website"))
          .setStyle(ButtonStyle.Link)
          .setURL(website)
          .setEmoji({ name: "🌐" }),
      );
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
      buttons.push(
        new ButtonBuilder()
          .setLabel(t("core:inviteBot"))
          .setStyle(ButtonStyle.Link)
          .setURL(inviteUrl)
          .setEmoji({ name: "🎉" }),
      );
    }

    const actionRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
    if (buttons.length > 0) {
      actionRows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          ...buttons,
        ),
      );
    }

    return makeCard(0 || 0x5865f2, t("core:commandCenter"), body, {
      actionRows,
    });
  }
}
