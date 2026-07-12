import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  ChannelType,
} from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { BaseCommand } from "#lib/commands.js";
import { Colors } from "#lib/utilities/branding.js";
import { Emojis } from "#lib/utilities/assets.js";
import { makeCard } from "#lib/utilities/cards.js";

@ApplyOptions<BaseCommand.Options>({
  name: "serverinfo",
  aliases: ["sinfo", "guildinfo", "server"],
  description: "Displays detailed information about this server.",
  preconditions: ["GuildOnly"],
})
export class ServerInfoCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const card = await this.buildServerCard(interaction);
    await this.reply(interaction, card);
  }

  public override async messageRun(message: Message) {
    if (!message.channel.isSendable()) return;
    const card = await this.buildServerCard(message);
    await message.reply({
      ...card,
      allowedMentions: {},
    });
  }

  protected async buildServerCard(ctx: ChatInputCommandInteraction | Message) {
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

    const formatCount = (count: number) =>
      count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();

    const body = [
      `**Server Owner**: ${owner.user.toString()} (ID: \`${owner.id}\`)\n` +
        `**Created At**: ${time(guild.createdAt, TimestampStyles.RelativeTime)} (${time(guild.createdAt, TimestampStyles.ShortDate)})\n` +
        `**Guild ID**: \`${guild.id}\``,

      `### ${Emojis.MEMBERS} MEMBERS\n` +
        `**Total Members**: ***${formatCount(guild.memberCount)}***\n${
          guild.premiumSubscriptionCount
            ? `**Server Boosts**: ***${guild.premiumSubscriptionCount}*** (Level ${guild.premiumTier})\n`
            : ""
        }`,

      `### ${Emojis.GATEWAY} CHANNELS\n` +
        `**Text Channels**: ***${textChannels}***\n` +
        `**Voice Channels**: ***${voiceChannels}***\n` +
        `**Categories**: ***${categoryChannels}***\n` +
        `**Total Channels**: ***${channels.size}***`,

      `### ${Emojis.GEAR} FEATURES\n` +
        `**Roles**: ***${roleCount}***\n` +
        `**Emojis**: ***${emojiCount}***\n` +
        `**Verification Level**: ***${guild.verificationLevel}***`,
    ];

    const buttons = [];
    const iconUrl = guild.iconURL({ size: 4096, extension: "png" });
    if (iconUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel("Server Icon Link")
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

    return makeCard(Colors.PRIMARY || 0x5865f2, guild.name, body, {
      actionRows,
    });
  }
}
