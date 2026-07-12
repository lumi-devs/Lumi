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
import { BaseCommand } from "#lib/commands.js";
import { LumiInfo, Colors } from "#utilities/branding.js";
import { Emojis } from "#utilities/assets.js";
import { BotConfig } from "#utilities/config.js";
import { collectPingData } from "#core/lib/ping-collect.js";
import { makeCard, ephemeralCard } from "#utilities/cards.js";

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
    const card = await this.buildAboutCard();
    await this.reply(interaction, ephemeralCard(card));
  }

  public override async messageRun(message: Message) {
    if (!message.channel.isSendable()) return;
    const card = await this.buildAboutCard();
    await message.reply({
      ...card,
    });
  }

  private async buildAboutCard() {
    const data = await collectPingData();

    // Calculate age of the bot since inception
    const ageDays = LumiInfo.getAgeInDays();
    const ageText =
      ageDays === 0 ? "today" : `${ageDays} day${ageDays > 1 ? "s" : ""} ago`;

    // Dynamic counts
    const serverCount = data.guilds;
    const userCount = data.users;
    const channelCount = data.channels;

    const fmtCount = (count: number) =>
      count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();

    // Format timestamps
    const bootTime = new Date(Date.now() - data.uptime);
    const hostBootTime = new Date(Date.now() - data.osUptimeSecs * 1000);

    // Map loaded modules
    const loadedModulesList = data.modules
      .map((m) => m.meta.displayName)
      .join(", ");

    const body = [
      `${Emojis.BOT} **${LumiInfo.tagline}** (Codename: *${LumiInfo.codename}*)\n` +
        `Bringing modular harmony to Discord since 11 Jul 2026 (over ${ageText}!).`,

      `### ${Emojis.ANALYTICS} INSTANCE STATISTICS\n` +
        `> **Uptime**\n> ┕ ${time(bootTime, TimestampStyles.RelativeTime)}\n` +
        `> **Host Uptime**\n> ┕ ${time(hostBootTime, TimestampStyles.RelativeTime)}\n` +
        `> **Servers**\n> ┕ ***${fmtCount(serverCount)}***\n` +
        `> **Members**\n> ┕ ***${fmtCount(userCount)}***\n` +
        `> **Channels**\n> ┕ ***${fmtCount(channelCount)}***`,

      `### ${Emojis.GEAR} CORE ARCHITECTURE\n` +
        `> **Lumi Version**\n> ┕ ***v${LumiInfo.version}***\n` +
        `> **Runtime Environment**\n> ┕ ***${data.runtime}***\n` +
        `> **Core Libraries**\n> ┕ ***discord.js v${data.djsVersion} | Sapphire v${data.sapphireVersion}***\n` +
        `> **Storage & Cache**\n> ┕ ***Prisma v${data.prismaVersion} | Redis v${data.redisVersion}***\n` +
        `> **Event Pipeline**\n> ┕ ***RabbitMQ (${data.rabbitConnected ? "Connected" : "Offline"}) | BullMQ***`,

      `### ${Emojis.REPO} LOADED MODULES\n` +
        `┕ *${loadedModulesList || "None"}*`,
    ];

    // Build action buttons
    const buttons: ButtonBuilder[] = [];

    // Support server link
    const supportServer = BotConfig.branding.links?.supportServer;
    if (supportServer) {
      buttons.push(
        new ButtonBuilder()
          .setLabel("Support Server")
          .setStyle(ButtonStyle.Link)
          .setURL(supportServer)
          .setEmoji({ name: "🆘" }),
      );
    }

    // GitHub repository link
    const githubUrl = BotConfig.branding.links?.github || LumiInfo.github;
    if (githubUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel("GitHub")
          .setStyle(ButtonStyle.Link)
          .setURL(githubUrl)
          .setEmoji(
            Emojis.parse(Emojis.custom("<:github:950888087188283422>", "🐙")),
          ),
      );
    }

    // Website link
    const website = BotConfig.branding.links?.website;
    if (website) {
      buttons.push(
        new ButtonBuilder()
          .setLabel("Website")
          .setStyle(ButtonStyle.Link)
          .setURL(website)
          .setEmoji({ name: "🌐" }),
      );
    }

    // Invite link
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
          .setLabel("Invite Bot")
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

    return makeCard(Colors.PRIMARY || 0x5865f2, `Lumi — Command Center`, body, {
      actionRows,
    });
  }
}
