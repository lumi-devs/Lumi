import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
} from "@lumi/module-kit";
import {
  createActionButton,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  makeInfoCard,
  row,
} from "@lumi/ui";
import {
  type ButtonInteraction,
  ButtonStyle,
  SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";

const UtilityConfigSchema = z.object({});

interface AvatarCardOptions {
  displayName: string;
  userId: string;
  avatarUrl: string | null;
  reveal: boolean;
}

const buildAvatarCard = ({
  displayName,
  userId,
  avatarUrl,
  reveal,
}: AvatarCardOptions) => {
  const actionRows = avatarUrl
    ? [
        row(
          reveal
            ? createActionButton({
                label: "Avatar Link",
                url: avatarUrl,
              })
            : createActionButton({
                customId: `utility:avatar:view:${userId}`,
                label: "View Avatar",
                style: ButtonStyle.Primary,
              }),
        ),
      ]
    : [];

  return makeCard(undefined, `${displayName}'s Avatar`, "", {
    headerImages: reveal && avatarUrl ? [avatarUrl] : undefined,
    actionRows,
  });
};

const avatarDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Get a user's avatar")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("User to get avatar for")
        .setRequired(false),
    ),
  aliases: ["av"],
  async execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const isSelf = target.id === interaction.user.id;
    const avatarUrl = target.avatar
      ? target.displayAvatarURL({ size: 4096, extension: "png" })
      : null;
    const card = buildAvatarCard({
      displayName: target.displayName,
      userId: target.id,
      avatarUrl,
      reveal: isSelf,
    });

    await interaction.reply(isSelf ? card : ephemeralCard(card));
  },
};

const bannerDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Get a user's banner")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("User to get banner for")
        .setRequired(false),
    ),
  aliases: ["b"],
  async execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const user = await interaction.client.users.fetch(target.id, {
      force: true,
    });
    const banner = user.bannerURL({ size: 512, extension: "png" });

    if (!banner) {
      await interaction.reply(
        ephemeralCard(
          makeInfoCard("No Banner", `${target.tag} doesn't have a banner`),
        ),
      );
      return;
    }

    await interaction.reply(
      makeCard(
        undefined,
        `🖼️ ${target.tag}'s Banner`,
        [
          `**User**\n${target.tag} (\`${target.id}\`)`,
          `**Download**\n[PNG](${banner})`,
        ],
        { headerImages: [banner] },
      ),
    );
  },
};

const whoisDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("whois")
    .setDescription("Get information about a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to lookup").setRequired(false),
    ),
  async execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const member = interaction.guild?.members.cache.get(target.id);

    const lines = [
      `**Username**\n${target.tag}`,
      `**ID**\n\`${target.id}\``,
      `**Bot**\n${target.bot ? "Yes" : "No"}`,
      `**Account Created**\n<t:${Math.floor(target.createdTimestamp / 1000)}:F>`,
    ];

    if (member) {
      const roleList =
        member.roles.cache.size - 1 > 0
          ? member.roles.cache
              .filter((r) => r.id !== interaction.guild!.id)
              .map((r) => r.toString())
              .join(", ")
          : "None";
      lines.push(
        `**Joined Server**\n<t:${Math.floor(member.joinedTimestamp! / 1000)}:F>`,
        `**Roles**\n${roleList.length > 1500 ? `${roleList.slice(0, 1500)}…` : roleList}`,
      );
    }

    await interaction.reply(
      makeCard(undefined, "👤 User Info", lines, {
        thumbnailUrl: target.displayAvatarURL(),
      }),
    );
  },
};

const serverinfoDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get information about the server"),
  async execute(interaction) {
    const guild = interaction.guild!;
    const banner = guild.bannerURL({ size: 512 });

    await interaction.reply(
      makeCard(
        undefined,
        `🏰 ${guild.name}`,
        [
          `**ID**\n\`${guild.id}\``,
          `**Owner**\n<@${guild.ownerId}>`,
          `**Created**\n<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          `**Members**\n${guild.memberCount}`,
          `**Channels**\n${guild.channels.cache.size}`,
          `**Roles**\n${guild.roles.cache.size}`,
          `**Boosts**\n${guild.premiumSubscriptionCount ?? 0} (Level ${guild.premiumTier})`,
          `**Verification**\n${guild.verificationLevel.toString()}`,
        ],
        {
          thumbnailUrl: guild.iconURL({ size: 256 }) ?? undefined,
          headerImages: banner ? [banner] : undefined,
        },
      ),
    );
  },
};

const roleinfoDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("roleinfo")
    .setDescription("Get information about a role")
    .addRoleOption((o) =>
      o.setName("role").setDescription("Role to lookup").setRequired(true),
    ),
  async execute(interaction) {
    const role = interaction.options.getRole("role", true);

    if (
      !role ||
      !("members" in role) ||
      !("hexColor" in role) ||
      !("position" in role)
    ) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Invalid", "Role not found in this server"),
        ),
      );
      return;
    }

    const color =
      role.hexColor === "#000000"
        ? undefined
        : parseInt(role.hexColor.slice(1), 16);

    await interaction.reply(
      makeCard(color, `🎭 Role Info: ${role.name}`, [
        `**ID**\n\`${role.id}\``,
        `**Color**\n#${role.hexColor}`,
        `**Position**\n${role.position}`,
        `**Members**\n${role.members.size}`,
        `**Hoisted**\n${role.hoist ? "Yes" : "No"}`,
        `**Mentionable**\n${role.mentionable ? "Yes" : "No"}`,
        `**Managed**\n${role.managed ? "Yes" : "No"}`,
        `**Created**\n<t:${Math.floor(role.createdTimestamp / 1000)}:F>`,
      ]),
    );
  },
};

const channelinfoDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("Get information about a channel")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to lookup")
        .setRequired(false),
    ),
  async execute(interaction) {
    const channel =
      interaction.options.getChannel("channel") ?? interaction.channel!;

    if (!channel || !("guildId" in channel) || !channel.name) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Invalid", "Channel not found")),
      );
      return;
    }

    const lines = [
      `**Name**\n${channel.name}`,
      `**ID**\n\`${channel.id}\``,
      `**Type**\n${channel.type.toString()}`,
    ];

    if ("isTextBased" in channel && channel.isTextBased()) {
      lines.push(
        `**NSFW**\n${"nsfw" in channel && channel.nsfw ? "Yes" : "No"}`,
        `**Topic**\n${"topic" in channel ? (channel.topic ?? "None") : "N/A"}`,
      );
    }
    if ("isVoiceBased" in channel && channel.isVoiceBased()) {
      lines.push(
        `**Bitrate**\n${"bitrate" in channel ? `${channel.bitrate / 1000}kbps` : "N/A"}`,
        `**User Limit**\n${"userLimit" in channel ? (channel.userLimit === 0 ? "Unlimited" : channel.userLimit.toString()) : "N/A"}`,
      );
    }

    await interaction.reply(makeCard(undefined, "📺 Channel Info", lines));
  },
};

const emojiinfoDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("emojiinfo")
    .setDescription("Get information about an emoji")
    .addStringOption((o) =>
      o
        .setName("emoji")
        .setDescription("Emoji to lookup (custom emoji)")
        .setRequired(true),
    ),
  async execute(interaction) {
    const emojiInput = interaction.options.getString("emoji", true);
    const match = emojiInput.match(/<a?:(\w+):(\d+)>/);

    if (!match) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid",
            "Please provide a custom emoji (e.g. :emoji:)",
          ),
        ),
      );
      return;
    }

    const emoji = interaction.guild?.emojis.cache.get(match[2]);
    if (!emoji) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Not found", "Emoji not found in this server"),
        ),
      );
      return;
    }

    await interaction.reply(
      makeCard(
        undefined,
        `😀 Emoji Info: ${emoji.name}`,
        [
          `**ID**\n\`${emoji.id}\``,
          `**Animated**\n${emoji.animated ? "Yes" : "No"}`,
          `**Managed**\n${emoji.managed ? "Yes" : "No"}`,
          `**Requires Colons**\n${emoji.requiresColons ? "Yes" : "No"}`,
          `**Created**\n<t:${Math.floor(emoji.createdTimestamp / 1000)}:F>`,
          `**URL**\n[Link](${emoji.url})`,
        ],
        { thumbnailUrl: emoji.url },
      ),
    );
  },
};

const avatarViewListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("utility:avatar:view:")) return;

    const userId = interaction.customId.split(":")[3];
    if (!userId) return;

    const user = await interaction.client.users
      .fetch(userId, { force: true })
      .catch(() => null);

    if (!user) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Avatar Unavailable",
            "That user's avatar could not be loaded.",
          ),
        ),
      );
      return;
    }

    const avatarUrl = user.avatar
      ? user.displayAvatarURL({ size: 4096, extension: "png" })
      : null;
    const card = buildAvatarCard({
      displayName: user.displayName,
      userId: user.id,
      avatarUrl,
      reveal: true,
    });

    await interaction.reply(ephemeralCard(card));
  },
};

const utilityModule: ModuleDefinition = defineModule({
  name: "utility-info",
  displayName: "Utility",
  emoji: "🔧",
  description: "Avatar, banner, whois, serverinfo, and info commands",
  version: "2.0.0",
  config: UtilityConfigSchema,
  commands: [
    avatarDef,
    bannerDef,
    whoisDef,
    serverinfoDef,
    roleinfoDef,
    channelinfoDef,
    emojiinfoDef,
  ],
  listeners: [avatarViewListener],
  tasks: [],
  async onLoad(_services) {
    console.log("[utility] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[utility] Module unloaded");
  },
});

export default utilityModule;
