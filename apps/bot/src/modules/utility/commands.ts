import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  userMention,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ButtonStyle } from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import {
  makeCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  resolveCardColor,
} from "@lumi/ui";

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
    const pngUrl = targetUser.displayAvatarURL({ size: 4096, extension: "png" });
    const webpUrl = targetUser.displayAvatarURL({ size: 4096, extension: "webp" });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setLabel("PNG").setStyle(ButtonStyle.Link).setURL(pngUrl),
      new ButtonBuilder().setLabel("WebP").setStyle(ButtonStyle.Link).setURL(webpUrl),
    );

    return ctx.reply(
      makeCard(
        resolveCardColor("info"),
        `${targetUser.displayName}'s Avatar`,
        `Direct link: [Click here](${pngUrl})`,
        {
          thumbnailUrl: pngUrl,
          actionRows: [row],
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
    const fetched = await ctx.services.client.users.fetch(targetUser.id, { force: true }).catch(() => null);
    const bannerUrl = fetched?.bannerURL({ size: 4096 });

    if (!bannerUrl) {
      return ctx.reply(makeInfoCard("No Banner", `${targetUser.displayName} does not have a profile banner set.`));
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setLabel("View Banner").setStyle(ButtonStyle.Link).setURL(bannerUrl),
    );

    return ctx.reply(
      makeCard(
        resolveCardColor("info"),
        `${targetUser.displayName}'s Banner`,
        `Direct link: [Click here](${bannerUrl})`,
        {
          actionRows: [row],
        },
      ),
    );
  },
};

export const whoisCommand: CommandDef = {
  name: "whois",
  description: "Displays rich information about a user or guild member.",
  module: "utility",
  prefix: true,
  cooldownMs: 3_000,
  build: () =>
    new SlashCommandBuilder()
      .setName("whois")
      .setDescription("Displays rich information about a user or guild member.")
      .addUserOption((opt) => opt.setName("user").setDescription("User whose info to view").setRequired(false)),
  async run(ctx) {
    const targetUser = (await ctx.getUser("user")) ?? ctx.user;
    const member = ctx.guild ? await ctx.guild.members.fetch(targetUser.id).catch(() => null) : null;

    const lines: string[] = [
      `**User Mention**: ${userMention(targetUser.id)}`,
      `**Account ID**: \`${targetUser.id}\``,
      `**Bot Account**: ${targetUser.bot ? "🤖 Yes" : "👤 No"}`,
      `**Created At**: ${time(targetUser.createdAt, "R")} (${time(targetUser.createdAt, "F")})`,
    ];

    if (member) {
      lines.push(
        `\n### Member Information`,
        `**Joined Server**: ${member.joinedAt ? `${time(member.joinedAt, "R")} (${time(member.joinedAt, "F")})` : "Unknown"}`,
      );
      if (member.premiumSince) {
        lines.push(`**Server Boosting**: Since ${time(member.premiumSince, "R")}`);
      }

      const roles = member.roles.cache
        .filter((r) => r.id !== ctx.guildId)
        .sort((a, b) => b.position - a.position);

      const roleMentions = roles.map((r) => r.toString());
      const roleStr = roleMentions.length > 0 ? (roleMentions.length > 15 ? `${roleMentions.slice(0, 15).join(", ")} ...and ${roleMentions.length - 15} more` : roleMentions.join(", ")) : "None";

      lines.push(`**Roles [${roles.size}]**: ${roleStr}`);
    }

    return ctx.reply(
      makeCard(
        resolveCardColor("info"),
        targetUser.displayName,
        lines.join("\n"),
        {
          thumbnailUrl: targetUser.displayAvatarURL({ size: 512 }),
          breadcrumbs: ["Whois", targetUser.tag || targetUser.username],
        },
      ),
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
      `**Server Owner**: ${owner ? `${userMention(owner.id)} (\`${owner.id}\`)` : `\`${guild.ownerId}\``}`,
      `**Guild ID**: \`${guild.id}\``,
      `**Created At**: ${time(guild.createdAt, "R")} (${time(guild.createdAt, "F")})`,
      `\n### Members & Boosts`,
      `**Total Members**: **${guild.memberCount.toLocaleString()}**`,
      `**Server Boosts**: Level **${guild.premiumTier}** (${guild.premiumSubscriptionCount ?? 0} Boosts)`,
      `\n### Channels (${channels.size})`,
      `**Text**: ${textCount} • **Voice**: ${voiceCount} • **Categories**: ${categoryCount}`,
      `\n### Features & Settings`,
      `**Roles**: ${guild.roles.cache.size} • **Emojis**: ${guild.emojis.cache.size}`,
      `**Verification Level**: Level ${guild.verificationLevel}`,
    ];

    const iconUrl = guild.iconURL({ size: 512 });
    return ctx.reply(
      makeCard(resolveCardColor("info"), guild.name, lines.join("\n"), {
        ...(iconUrl ? { thumbnailUrl: iconUrl } : {}),
        breadcrumbs: ["Server Info", guild.name],
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
