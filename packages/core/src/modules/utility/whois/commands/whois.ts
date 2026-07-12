import { ApplyOptions } from "@sapphire/decorators";
import { Args, Command } from "@sapphire/framework";
import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  PermissionFlagsBits,
  GuildMember,
  User,
} from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { BaseCommand } from "#lib/commands.js";
import { Colors } from "#lib/utilities/branding.js";
import { makeCard, makeErrorCard } from "#lib/utilities/cards.js";

const KEY_PERMISSIONS = [
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

@ApplyOptions<BaseCommand.Options>({
  name: "whois",
  aliases: ["userinfo", "user", "memberinfo"],
  description: "Displays information about a user or guild member.",
  preconditions: ["GuildOnly"],
})
export class WhoisCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user whose info to display (defaults to you).")
            .setRequired(false),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member =
      (interaction.options.getMember("user") as GuildMember) ??
      (await interaction.guild!.members.fetch(user.id).catch(() => null));

    const card = this.buildWhoisCard(user, member, interaction.guildId!);
    await this.reply(interaction, card);
  }

  public override async messageRun(message: Message, args: Args) {
    if (!message.channel.isSendable()) return;

    let user = message.author;
    if (!args.finished) {
      const userResult = await args.pickResult("user");
      if (userResult.isOk()) {
        user = userResult.unwrap();
      } else {
        await message.reply({
          ...makeErrorCard(
            "User Not Found",
            "Please specify a valid user mention or ID.",
          ),
          allowedMentions: {},
        });
        return;
      }
    }

    const member = await message
      .guild!.members.fetch(user.id)
      .catch(() => null);
    const card = this.buildWhoisCard(user, member, message.guildId!);
    await message.reply({
      ...card,
      allowedMentions: {},
    });
  }

  protected buildWhoisCard(
    user: User,
    member: GuildMember | null,
    guildId: string,
  ) {
    const userTag =
      user.discriminator === "0"
        ? `@${user.username}`
        : `${user.username}#${user.discriminator}`;
    const botBadge = user.bot ? ` [BOT]` : "";

    const userSec =
      `**User Mention**: ${user.toString()}\n` +
      `**Account ID**: \`${user.id}\`\n` +
      `**Created At**: ${time(user.createdAt, TimestampStyles.RelativeTime)} (${time(user.createdAt, TimestampStyles.ShortDate)})`;

    const body = [userSec];

    let color = Colors.NEUTRAL || 0x4f545c;

    if (member) {
      color = member.displayColor || Colors.PRIMARY || 0x5865f2;
      const joinedSec = `**Joined Server**: ${time(member.joinedAt!, TimestampStyles.RelativeTime)} (${time(member.joinedAt!, TimestampStyles.ShortDate)})\n${
        member.premiumSince
          ? `**Server Boosting Since**: ${time(member.premiumSince, TimestampStyles.RelativeTime)}`
          : ""
      }`;

      body.push(`### Member Information\n${joinedSec}`);

      const sortedRoles = member.roles.cache
        .filter((r) => r.id !== guildId)
        .sort((a, b) => b.position - a.position);

      let rolesText = "No roles";
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
          rolesText = `${current} ...and ${sortedRoles.size - count} more`;
        } else {
          rolesText = mentions.join(" ");
        }
      }
      body.push(`### Roles [${sortedRoles.size}]\n${rolesText}`);

      let keyPermsText = "None";
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        keyPermsText = "Administrator (All Permissions)";
      } else {
        const perms = KEY_PERMISSIONS.filter((p) =>
          member.permissions.has(p.flag),
        ).map((p) => p.name);
        if (perms.length > 0) {
          keyPermsText = perms.join(", ");
        }
      }
      body.push(`### Key Permissions\n${keyPermsText}`);
    }

    const avatarUrl = user.displayAvatarURL({ size: 4096, extension: "png" });
    const buttons = [
      new ButtonBuilder()
        .setLabel("View Profile")
        .setStyle(ButtonStyle.Link)
        .setURL(`discord://-/users/${user.id}`)
        .setEmoji({ name: "👤" }),
    ];

    if (avatarUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel("Avatar Link")
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
}
