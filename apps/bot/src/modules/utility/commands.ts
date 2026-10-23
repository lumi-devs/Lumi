import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  userMention,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ButtonStyle } from "discord.js";
import { confirmPrompt, type CommandDef } from "@lumi/bot-kit";
import {
  makeCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  resolveCardColor,
} from "@lumi/ui";

const KeyPermissions = [
  { flag: PermissionFlagsBits.Administrator, name: "Administrator (All Permissions)" },
  { flag: PermissionFlagsBits.ManageGuild, name: "Manage Server" },
  { flag: PermissionFlagsBits.ManageRoles, name: "Manage Roles" },
  { flag: PermissionFlagsBits.ManageChannels, name: "Manage Channels" },
  { flag: PermissionFlagsBits.BanMembers, name: "Ban Members" },
  { flag: PermissionFlagsBits.KickMembers, name: "Kick Members" },
  { flag: PermissionFlagsBits.ManageMessages, name: "Manage Messages" },
  { flag: PermissionFlagsBits.ManageWebhooks, name: "Manage Webhooks" },
  { flag: PermissionFlagsBits.MentionEveryone, name: "Mention Everyone" },
];

export const avatarCommand: CommandDef = {
  name: "avatar",
  description: "Display a user's avatar in full resolution.",
  module: "utility",
  prefix: true,
  cooldownMs: 3_000,
  build: () =>
    new SlashCommandBuilder()
      .setName("avatar")
      .setDescription("Display a user's avatar in full resolution.")
      .addUserOption((opt) => opt.setName("user").setDescription("User whose avatar to display").setRequired(false)),
  async run(ctx) {
    const targetUser = (await ctx.getUser("user")) ?? ctx.user;
    const isSelf = targetUser.id === ctx.user.id;
    const avatarUrl = targetUser.displayAvatarURL({ size: 4096, extension: "png" });

    if (isSelf) {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Avatar Link")
          .setStyle(ButtonStyle.Link)
          .setURL(avatarUrl)
          .setEmoji({ name: "🖼️" }),
      );

      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder({ media: { url: avatarUrl } }),
      );

      return ctx.reply(
        makeCard(
          resolveCardColor("info"),
          `${targetUser.displayName}'s Avatar`,
          "",
          {
            mediaGallery: gallery,
            actionRows: [row],
            breadcrumbs: ["Avatar", targetUser.tag || targetUser.username],
          },
        ),
      );
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`user-media:view:${targetUser.id}:avatar`)
        .setLabel("View Avatar")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ name: "🖼️" }),
    );

    return ctx.reply(
      makeCard(
        resolveCardColor("info"),
        `${targetUser.displayName}'s Avatar`,
        "",
        {
          actionRows: [row],
          breadcrumbs: ["Avatar", targetUser.tag || targetUser.username],
        },
      ),
    );
  },
};

export const bannerCommand: CommandDef = {
  name: "banner",
  description: "Display a user's profile banner.",
  module: "utility",
  prefix: true,
  cooldownMs: 3_000,
  build: () =>
    new SlashCommandBuilder()
      .setName("banner")
      .setDescription("Display a user's profile banner.")
      .addUserOption((opt) => opt.setName("user").setDescription("User whose banner to display").setRequired(false)),
  async run(ctx) {
    const targetUser = (await ctx.getUser("user")) ?? ctx.user;
    const isSelf = targetUser.id === ctx.user.id;
    const fetched = await ctx.services.client.users.fetch(targetUser.id, { force: true }).catch(() => null);
    const bannerUrl = fetched?.bannerURL({ size: 4096, extension: "png" });

    if (!bannerUrl) {
      return ctx.reply(makeInfoCard("No Banner", `${targetUser.displayName} does not have a profile banner set.`));
    }

    if (isSelf) {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Banner Link")
          .setStyle(ButtonStyle.Link)
          .setURL(bannerUrl)
          .setEmoji({ name: "🖼️" }),
      );

      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder({ media: { url: bannerUrl } }),
      );

      return ctx.reply(
        makeCard(
          resolveCardColor("info"),
          `${targetUser.displayName}'s Banner`,
          "",
          {
            mediaGallery: gallery,
            actionRows: [row],
            breadcrumbs: ["Banner", targetUser.tag || targetUser.username],
          },
        ),
      );
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`user-media:view:${targetUser.id}:banner`)
        .setLabel("View Banner")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ name: "🖼️" }),
    );

    return ctx.reply(
      makeCard(
        resolveCardColor("info"),
        `${targetUser.displayName}'s Banner`,
        "",
        {
          actionRows: [row],
          breadcrumbs: ["Banner", targetUser.tag || targetUser.username],
        },
      ),
    );
  },
};

export const whoisCommand: CommandDef = {
  name: "whois",
  description: "Displays information about a user or guild member.",
  module: "utility",
  prefix: true,
  cooldownMs: 3_000,
  build: () =>
    new SlashCommandBuilder()
      .setName("whois")
      .setDescription("Displays information about a user or guild member.")
      .addUserOption((opt) => opt.setName("user").setDescription("User whose info to view").setRequired(false)),
  async run(ctx) {
    const targetUser = (await ctx.getUser("user")) ?? ctx.user;
    const member = ctx.guild ? await ctx.guild.members.fetch(targetUser.id).catch(() => null) : null;

    const lines: string[] = [
      `**User Mention**: ${userMention(targetUser.id)}`,
      `**Account ID**: \`${targetUser.id}\``,
      `**Created At**: ${time(targetUser.createdAt, "R")} (${time(targetUser.createdAt, "d")})`,
    ];

    let cardColor = resolveCardColor("neutral");

    if (member) {
      cardColor = member.displayColor || resolveCardColor("primary");
      lines.push(
        `\n### Member Information`,
        `**Joined Server**: ${member.joinedAt ? `${time(member.joinedAt, "R")} (${time(member.joinedAt, "d")})` : "Unknown"}`,
      );
      if (member.premiumSince) {
        lines.push(`**Server Boosting Since**: ${time(member.premiumSince, "R")}`);
      }

      const sortedRoles = member.roles.cache
        .filter((r) => r.id !== ctx.guildId)
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
      lines.push(`\n### Roles [${sortedRoles.size}]\n${rolesText}`);

      let keyPermsText = "None";
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        keyPermsText = "Administrator (All Permissions)";
      } else {
        const perms = KeyPermissions.filter((p) => member.permissions.has(p.flag)).map((p) => p.name);
        if (perms.length > 0) keyPermsText = perms.join(", ");
      }
      lines.push(`\n### Key Permissions\n${keyPermsText}`);
    }

    const avatarUrl = targetUser.displayAvatarURL({ size: 4096, extension: "png" });
    const buttons = [
      new ButtonBuilder()
        .setLabel("View Profile")
        .setStyle(ButtonStyle.Link)
        .setURL(`discord://-/users/${targetUser.id}`)
        .setEmoji({ name: "👤" }),
      new ButtonBuilder()
        .setLabel("Avatar Link")
        .setStyle(ButtonStyle.Link)
        .setURL(avatarUrl)
        .setEmoji({ name: "🖼️" }),
    ];

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);

    return ctx.reply(
      makeCard(cardColor, targetUser.displayName, lines.join("\n"), {
        thumbnailUrl: targetUser.displayAvatarURL({ size: 512 }),
        breadcrumbs: ["Whois", targetUser.tag || targetUser.username],
        actionRows: [row],
      }),
    );
  },
};

export const serverinfoCommand: CommandDef = {
  name: "serverinfo",
  description: "Displays detailed information about this server.",
  module: "utility",
  guildOnly: true,
  prefix: true,
  cooldownMs: 5_000,
  build: () =>
    new SlashCommandBuilder().setName("serverinfo").setDescription("Displays detailed information about this server."),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;
    const textCount = channels.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceCount = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categoryCount = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

    const lines: string[] = [
      `**Server Owner**: ${owner ? `${userMention(owner.id)} (ID: \`${owner.id}\`)` : `\`${guild.ownerId}\``}`,
      `**Guild ID**: \`${guild.id}\``,
      `**Created At**: ${time(guild.createdAt, "R")} (${time(guild.createdAt, "d")})`,
      `\n### MEMBERS`,
      `**Total Members**: ***${guild.memberCount.toLocaleString()}***`,
      `**Server Boosts**: ***${guild.premiumSubscriptionCount ?? 0}*** (Level ${guild.premiumTier})`,
      `\n### CHANNELS`,
      `**Text Channels**: ***${textCount}***`,
      `**Voice Channels**: ***${voiceCount}***`,
      `**Categories**: ***${categoryCount}***`,
      `**Total Channels**: ***${channels.size}***`,
      `\n### FEATURES`,
      `**Roles**: ***${guild.roles.cache.size}***`,
      `**Emojis**: ***${guild.emojis.cache.size}***`,
      `**Verification Level**: ***${guild.verificationLevel}***`,
    ];

    const iconUrl = guild.iconURL({ size: 4096, extension: "png" });
    const actionRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
    if (iconUrl) {
      actionRows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("Server Icon Link")
            .setStyle(ButtonStyle.Link)
            .setURL(iconUrl)
            .setEmoji({ name: "🏰" }),
        ),
      );
    }

    return ctx.reply(
      makeCard(resolveCardColor("primary"), guild.name, lines.join("\n"), {
        breadcrumbs: ["Server Info", guild.name],
        ...(actionRows.length > 0 ? { actionRows } : {}),
      }),
    );
  },
};

export const nickCommand: CommandDef = {
  name: "nick",
  description: "Change a member's nickname.",
  module: "utility",
  guildOnly: true,
  permitNode: "utility.nick",
  requiredPermissions: PermissionFlagsBits.ManageNicknames,
  build: () =>
    new SlashCommandBuilder()
      .setName("nick")
      .setDescription("Change a member's nickname.")
      .addUserOption((opt) => opt.setName("user").setDescription("Target member").setRequired(true))
      .addStringOption((opt) => opt.setName("nickname").setDescription("New nickname (empty to reset)").setRequired(false)),
  async run(ctx) {
    const targetMember = await ctx.getMember("user");
    if (!targetMember) return ctx.reply(makeErrorCard("Not Found", "Member not found in this server."));

    const newNick = (await ctx.getString("nickname"))?.trim() ?? null;

    if (!targetMember.manageable && targetMember.id !== ctx.services.client.user?.id) {
      return ctx.reply(makeErrorCard("Hierarchy Error", "I cannot modify that member's nickname due to role hierarchy."));
    }

    await targetMember.setNickname(newNick ? newNick.slice(0, 32) : null);

    return ctx.reply(
      makeSuccessCard(
        "Nickname Updated",
        newNick
          ? `Changed ${userMention(targetMember.id)}'s nickname to **${newNick.slice(0, 32)}**.`
          : `Reset ${userMention(targetMember.id)}'s nickname.`,
      ),
    );
  },
};

export const purgeCommand: CommandDef = {
  name: "purge",
  description: "Mass-delete messages from a text channel.",
  module: "utility",
  guildOnly: true,
  permitNode: "utility.purge",
  requiredPermissions: PermissionFlagsBits.ManageMessages,
  build: () =>
    new SlashCommandBuilder()
      .setName("purge")
      .setDescription("Mass-delete messages from a text channel.")
      .addIntegerOption((opt) =>
        opt.setName("amount").setDescription("Number of messages to delete (1-100)").setRequired(true).setMinValue(1).setMaxValue(100),
      )
      .addUserOption((opt) => opt.setName("user").setDescription("Filter by author").setRequired(false)),
  async run(ctx) {
    const channel = ctx.channel;
    if (!channel || !channel.isSendable() || !("bulkDelete" in channel)) {
      return ctx.reply(makeErrorCard("Not Supported", "Messages cannot be bulk-deleted in this channel."));
    }

    const amount = (await ctx.getInteger("amount")) ?? 10;
    const filterUser = await ctx.getUser("user");

    if (amount > 50) {
      const confirmResult = await confirmPrompt(ctx, {
        title: "Confirmation Required",
        body: `Are you sure you want to delete the last **${amount}** messages?`,
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
      });

      if (!confirmResult.confirmed) {
        return ctx.reply(makeInfoCard("Purge Cancelled", "The purge operation was cancelled."));
      }
    }

    await ctx.defer();

    let messagesToDelete = await channel.messages.fetch({ limit: amount });
    if (filterUser) {
      messagesToDelete = messagesToDelete.filter((m) => m.author.id === filterUser.id);
    }

    const deleted = await channel.bulkDelete(messagesToDelete, true);

    return ctx.reply(
      makeSuccessCard(
        "Messages Purged",
        `Successfully deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"}${filterUser ? ` from ${userMention(filterUser.id)}` : ""}.`,
      ),
    );
  },
};
