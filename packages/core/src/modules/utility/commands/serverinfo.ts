import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  ChannelType,
  type InteractionReplyOptions,
} from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { BaseCommand, sendReply, fetchTyped } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
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
    const t = await fetchTyped(interaction);
    const card = await this.buildServerCard(interaction, t);
    await sendReply(interaction, card);
  }

  public override async messageRun(message: Message) {
    if (!message.channel.isSendable()) return;
    const t = await fetchTyped(message);
    const card = await this.buildServerCard(message, t);
    await message.reply({
      ...card,
      allowedMentions: {},
    });
  }

  protected async buildServerCard(
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

      `### ${Emojis.MEMBERS} ${t("commands:serverinfoMembersTitle")}\n` +
        `${t("commands:serverinfoTotalMembers", { count: guild.memberCount })}\n${
          guild.premiumSubscriptionCount
            ? `${t("commands:serverinfoServerBoosts", {
                count: guild.premiumSubscriptionCount,
                tier: guild.premiumTier,
              })}\n`
            : ""
        }`,

      `### ${Emojis.GATEWAY} ${t("commands:serverinfoChannelsTitle")}\n` +
        `${t("commands:serverinfoTextChannels", { count: textChannels })}\n` +
        `${t("commands:serverinfoVoiceChannels", { count: voiceChannels })}\n` +
        `${t("commands:serverinfoCategories", { count: categoryChannels })}\n` +
        `${t("commands:serverinfoTotalChannels", { count: channels.size })}`,

      `### ${Emojis.GEAR} ${t("commands:serverinfoFeaturesTitle")}\n` +
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

    return makeCard(0 || 0x5865f2, guild.name, body, {
      actionRows,
    });
  }
}
