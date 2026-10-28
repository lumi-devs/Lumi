import {
  SlashCommandBuilder,
  AttachmentBuilder,
  type Message,
  type GuildMember,
  type Interaction,
  type Guild,
  type VoiceState,
  Events,
} from "discord.js";
import { defineModule, type CommandDefinition, type ModuleDefinition, type ListenerDefinition } from "@lumi/module-kit";
import {
  makeCard,
  makeEmptyCard,
  ephemeralCard,
  createPaginationRow,
  formatPageFooter,
  AccentColors,
  type CardReply,
} from "@lumi/ui";
import {
  LevelFormulas,
  levelProgress,
  levelForTotalXp,
} from "./formulas.js";
import {
  getLevelingConfig,
  AnnounceMessageDefault,
  channelEarnsXp,
  rolesEarnXp,
  type LevelingConfig,
} from "./config.js";
import {
  voiceAudibleTransition,
  isAudible,
} from "./voice-sessions.js";
import { grantVoiceXp } from "./voice-xp.js";
import { LevelingModuleName } from "./constants.js";

async function addXp(services: any, guildId: string, userId: string, xp: number, config: LevelingConfig): Promise<void> {
  const user = await services.db.prisma.levelingUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { 
      xp: { increment: xp },
      totalXp: { increment: xp },
      messageCount: { increment: 1 },
    },
    create: { 
      guildId, 
      userId, 
      xp, 
      totalXp: xp,
      level: 1,
      messageCount: 1,
    },
  });

  if (!user) return;

  const totalXp = Number(user.totalXp);
  const { level: newLevel } = levelForTotalXp(config.levelFormula, totalXp);
  
  if (newLevel > user.level) {
    await services.db.prisma.levelingUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { level: newLevel },
    });

    for (const reward of config.roleRewards) {
      if (newLevel >= reward.level) {
        try {
          const guild = services.client.guilds.cache.get(guildId);
          if (guild) {
            const member = await guild.members.fetch(userId);
            if (member) {
              if (reward.removePrevious) {
                for (const r of config.roleRewards) {
                  if (r.level < reward.level && member.roles.cache.has(r.roleId)) {
                    await member.roles.remove(r.roleId);
                  }
                }
              }
              await member.roles.add(reward.roleId);
            }
          }
        } catch (e) {
          console.error(`Failed to assign level role ${reward.roleId}:`, e);
        }
      }
    }
  }
}

const rankDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your or another user's level")
    .addUserOption(o => o.setName("user").setDescription("User to check").setRequired(false)),
  async execute(interaction, services) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId!;

    const user = await services.db.prisma.levelingUser.findUnique({
      where: { guildId_userId: { guildId, userId: target.id } },
    });

    if (!user) {
      await interaction.reply(ephemeralCard(makeEmptyCard(
        "No XP yet",
        `${target.username} has not earned any XP.`,
        "Send a message or join a voice channel to start earning XP.",
      )));
      return;
    }

    const config = await getLevelingConfig(services, guildId);

    const [ahead, totalUsers] = await Promise.all([
      services.db.prisma.levelingUser.count({
        where: { guildId, totalXp: { gt: user.totalXp } },
      }),
      services.db.prisma.levelingUser.count({ where: { guildId } }),
    ]);
    const rank = ahead + 1;

    const totalXp = Number(user.totalXp);
    const { level } = levelForTotalXp(config.levelFormula, totalXp);
    const progress = levelProgress(config.levelFormula, totalXp, level);
    const filled = Math.round(progress.progress * 10);
    const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;

    const body = [
      `**Level** — ${progress.level}\n**Rank** — #${rank} / ${totalUsers}\n**XP** — ${totalXp.toLocaleString()}`,
      `${bar} ${Math.round(progress.progress * 100)}%`,
      progress.xpForNext === 0
        ? "**Max level reached**"
        : `**To next level** — ${progress.xpForNext.toLocaleString()} XP`,
    ];

    const footer = `${config.xpPerMessage} XP per message · ${config.voiceXpPerMinute} XP per VC minute`;
    const options = {
      subtitle: "Rank card",
      thumbnailUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
      footer,
    };

    let attachment: AttachmentBuilder | null = null;
    try {
      const { generateRankCard } = await import("./rankCard.js");
      attachment = new AttachmentBuilder(
        await generateRankCard({
          username: target.username,
          avatarUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
          level: progress.level,
          xp: progress.xpIntoLevel,
          xpToNext: progress.xpForNext,
          rank,
          totalUsers,
          guildName: interaction.guild?.name,
        }),
        { name: "rank.png" },
      );
    } catch (error) {
      services.observability?.logger?.warn?.(
        `[leveling] rank card generation failed: ${String(error)}`,
      );
    }

    if (attachment) {
      await interaction.reply({
        ...ephemeralCard(makeCard(undefined, "", "", {
          headerImages: ["attachment://rank.png"],
          footer,
          noAccent: true,
        })),
        files: [attachment],
      });
      return;
    }

    await interaction.reply(ephemeralCard(makeCard(AccentColors.purple, target.username, body, options)));
  },
};

async function renderLeaderboard(
  config: any,
  guild: Guild | null,
  guildId: string,
  requestedPage: number,
  services: any,
  boardType: "overall" | "voice" = "overall",
): Promise<CardReply> {
  const perPage = 10;

  let orderBy: any = { totalXp: "desc" };
  if (boardType === "voice") {
    orderBy = { voiceMinutes: "desc" };
  }

  const total = await services.db.prisma.levelingUser.count({ where: { guildId } });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  const users = await services.db.prisma.levelingUser.findMany({
    where: { guildId },
    orderBy,
    skip: (page - 1) * perPage,
    take: perPage,
  });

  if (users.length === 0) {
    return makeEmptyCard(
      "No XP yet",
      "Nobody has earned XP in this server.",
      "Send a message or join a voice channel to start earning XP.",
    );
  }

  const lines = users.map((u: any, i: number) => {
    const member = guild?.members.cache.get(u.userId);
    const name = member?.user.tag ?? `Unknown (${u.userId})`;
    if (boardType === "voice") {
      return `**#${(page - 1) * 10 + i + 1}** ${name} — ${u.voiceMinutes.toLocaleString()} voice minutes`;
    }
    const totalXp = Number(u.totalXp);
    const { level } = levelForTotalXp(config.levelFormula, totalXp);
    const progress = levelProgress(config.levelFormula, totalXp, level);
    return `**#${(page - 1) * 10 + i + 1}** ${name} — Level ${progress.level} · ${totalXp.toLocaleString()} XP (${progress.xpForNext.toLocaleString()} to next)`;
  });

  const title = boardType === "voice" ? "🎙️ Voice Leaderboard" : "🏆 XP Leaderboard";
  const color = boardType === "voice" ? AccentColors.cyan : AccentColors.gold;

  return makeCard(color, title, lines, {
    subtitle: guild?.name,
    footer: formatPageFooter(page - 1, totalPages, total),
    actionRows: [createPaginationRow({
      customIdPrefix: `leveling:lb:${boardType}`,
      currentPage: page - 1,
      totalPages,
    })],
  });
}

const leaderboardDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server XP leaderboard")
    .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false))
    .addStringOption(o => o.setName("type").setDescription("Leaderboard type").addChoices(
      { name: "Overall XP", value: "overall" },
      { name: "Voice Minutes", value: "voice" },
    ).setRequired(false)),
  async execute(interaction, services) {
    const page = interaction.options.getInteger("page") ?? 1;
    const boardType = interaction.options.getString("type") as "overall" | "voice" ?? "overall";
    const config = await getLevelingConfig(services, interaction.guildId!);
    const card = await renderLeaderboard(config, interaction.guild, interaction.guildId!, page, services, boardType);
    await interaction.reply(ephemeralCard(card));
  },
};

const leaderboardListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: any) {
    if (!interaction.isButton() || !interaction.customId.startsWith("leveling:lb:")) return;

    const [, , boardType, action, token] = interaction.customId.split(":");
    if (action !== "prev" && action !== "next") return;

    const page = Number.parseInt(token ?? "0", 10);
    const guildId = interaction.guildId;
    if (!Number.isFinite(page) || !guildId) return;

    await interaction.deferUpdate();
    const config = await getLevelingConfig(services, guildId);
    const card = await renderLeaderboard(config, interaction.guild, guildId, page + 1, services, boardType as "overall" | "voice");
    await interaction.editReply(card);
  },
};

function getXpMultiplier(
  member: GuildMember,
  config: LevelingConfig,
  channelId: string,
): number {
  let roleMultiplier = 1;
  for (const entry of config.multiplierRoles) {
    if (member.roles.cache.has(entry.roleId)) {
      roleMultiplier = Math.max(roleMultiplier, entry.multiplier);
    }
  }

  let channelMultiplier = 1;
  for (const entry of config.channelMultipliers) {
    if (entry.channelId === channelId) {
      channelMultiplier = Math.max(channelMultiplier, entry.multiplier);
    }
  }

  return config.globalMultiplier * roleMultiplier * channelMultiplier;
}

const onMessageListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: any) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId;
    const config = await getLevelingConfig(services, guildId);

    if (message.content.length < config.minMessageLength) return;
    if (!channelEarnsXp(config, message.channelId)) return;
    if (
      message.member &&
      !rolesEarnXp(config, message.member.roles.cache.keys())
    ) {
      return;
    }

    const now = Date.now();
    const user = await services.db.prisma.levelingUser.findUnique({
      where: { guildId_userId: { guildId, userId: message.author.id } },
    });

    if (
      user?.lastXpAt &&
      now - new Date(user.lastXpAt).getTime() < config.cooldownSeconds * 1000
    ) {
      return;
    }

    const multiplier = message.member
      ? getXpMultiplier(message.member, config, message.channelId)
      : config.globalMultiplier;
    const xp = Math.floor(config.xpPerMessage * multiplier);
    if (xp <= 0) return;

    await addXp(services, guildId, message.author.id, xp, config);

    await services.db.prisma.levelingUser.update({
      where: { guildId_userId: { guildId, userId: message.author.id } },
      data: { lastXpAt: new Date() },
    });
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: Events.VoiceStateUpdate,
  async handler(oldState: VoiceState, newState: VoiceState, services: any) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    const guild = newState.guild ?? oldState.guild;
    const guildId = guild.id;
    const config = await getLevelingConfig(services, guildId);
    if (!config.voiceEnabled) return;
    if (!rolesEarnXp(config, member.roles.cache.keys())) return;
    
    const [was, is] = await Promise.all([
      isAudible(oldState),
      isAudible(newState),
    ]);
    const elapsed = voiceAudibleTransition(
      guildId,
      member.id,
      was,
      is,
      Date.now(),
    );
    if (elapsed === null) return;
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return;
    
    await grantVoiceXp(services, guild, member, minutes, config);
  },
};

const levelingModule: ModuleDefinition = defineModule({
  name: LevelingModuleName,
  displayName: "Leveling",
  emoji: "📈",
  description: "XP, levels, role rewards, and leaderboards with voice XP support",
  version: "2.1.0",
  config: {},
  configFields: [
    { key: "levelFormula", label: "Level Formula", type: "select", choices: [...LevelFormulas], description: "Curve for XP required per level", default: "disgaea" },
    { key: "xpPerMessage", label: "XP per Message", type: "number", description: "Base XP per message" },
    { key: "cooldownSeconds", label: "XP Cooldown", type: "number", description: "Seconds between XP gains" },
    { key: "voiceEnabled", label: "Voice XP Enabled", type: "boolean", description: "Track voice minutes and grant XP for time in voice channels", default: false },
    { key: "voiceXpPerMinute", label: "Voice XP Per Minute", type: "number", description: "XP granted per audible minute in voice", default: 4 },
    { key: "announceEnabled", label: "Level-Up Announcements", type: "boolean", description: "Post a message when a member levels up", default: true },
    { key: "announceChannel", label: "Announcement Channel", type: "channel", description: "Channel for level-up messages" },
    { key: "announceMessage", label: "Announcement Message", type: "string", description: "Level-up message template. Supports {user}, {level}, {xp}, {xpNeeded}", default: AnnounceMessageDefault },
    { key: "minMessageLength", label: "Minimum Message Length", type: "number", description: "Messages shorter than this earn no XP", default: 4 },
    { key: "roleRewards", label: "Role Rewards", type: "json", description: "JSON array: [{level, roleId, removePrevious}]" },
    { key: "roleStack", label: "Stack Reward Roles", type: "boolean", description: "Keep every earned reward role", default: true },
    { key: "keepXpOnLeave", label: "Keep XP On Leave", type: "boolean", description: "Keep progress and restore reward roles on rejoin", default: true },
    { key: "globalMultiplier", label: "Global XP Multiplier", type: "number", description: "Multiplies all XP gains on this server", default: 1, min: 0, max: 100 },
    { key: "multiplierRoles", label: "XP Multiplier Roles", type: "json", description: "JSON array: [{roleId, multiplier}]" },
    { key: "channelMultipliers", label: "Channel XP Multipliers", type: "json", description: "JSON array: [{channelId, multiplier}]" },
    { key: "ignoredChannels", label: "Ignored Channels", type: "multi-channel", description: "Text channels where message XP is disabled. Inactive while a channel whitelist is set.", category: "Filters" },
    { key: "whitelistedChannels", label: "Whitelisted Channels", type: "multi-channel", description: "Only these text channels earn message XP. Overrides the ignored channel list.", category: "Filters" },
    { key: "ignoredRoles", label: "Ignored Roles", type: "multi-role", description: "Members with any of these roles earn no XP. Inactive while a role whitelist is set.", category: "Filters" },
    { key: "whitelistedRoles", label: "Whitelisted Roles", type: "multi-role", description: "Only members with one of these roles earn XP. Overrides the ignored role list.", category: "Filters" },
  ],
  commands: [rankDef, leaderboardDef],
  listeners: [onMessageListener, leaderboardListener, onVoiceStateListener],
  tasks: [],
  async onLoad(_services) {
    console.log("[leveling] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[leveling] Module unloaded");
  },
});

export default levelingModule;
