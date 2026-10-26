import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  Message,
  GuildMember,
  Interaction,
  type Guild,
  VoiceState,
  Events,
} from "discord.js";
import { defineModule, type CommandDefinition, type ModuleDefinition, type ListenerDefinition } from "@lumi/module-kit";
import {
  makeCard,
  makeSuccessCard,
  makeEmptyCard,
  ephemeralCard,
  createPaginationRow,
  formatPageFooter,
  AccentColors,
  type CardReply,
} from "@lumi/ui";
import { z } from "zod";
import {
  LevelFormulas,
  xpForLevel,
  totalXpForLevel,
  levelForTotalXp,
} from "./formulas.js";
import {
  getLevelingConfig,
  applyMultipliers,
  AnnounceMessageDefault,
} from "./config.js";
import { voiceSessionStart, voiceSessionEnd, isAudible } from "./voice-sessions.js";
import { grantVoiceXp } from "./voice-xp.js";

const LevelingConfigSchema = z.object({
  levelFormula: z.enum(LevelFormulas).default("disgaea"),
  xpPerMessage: z.number().int().min(1).max(1000).default(15),
  cooldownSeconds: z.number().int().min(1).max(3600).default(60),
  xpCurve: z.record(z.number()).default({}),
  voiceEnabled: z.boolean().default(false),
  voiceXpPerMinute: z.number().int().min(1).max(1000).default(4),
  announceEnabled: z.boolean().default(true),
  announceChannel: z.string().nullable().default(null),
  announceMessage: z.string().default(AnnounceMessageDefault),
  minMessageLength: z.number().int().min(0).max(500).default(4),
  roleRewards: z.array(z.object({
    level: z.number().int().min(1),
    roleId: z.string(),
    removePrevious: z.boolean().default(false),
  })).default([]),
  roleStack: z.boolean().default(true),
  keepXpOnLeave: z.boolean().default(true),
  globalMultiplier: z.number().min(0).max(100).default(1),
  multiplierRoles: z.array(z.object({
    roleId: z.string(),
    multiplier: z.number().positive().default(1.5),
  })).default([]),
  channelMultipliers: z.array(z.object({
    channelId: z.string(),
    multiplier: z.number().positive().default(1.5),
  })).default([]),
  ignoredChannels: z.array(z.string()).default([]),
  ignoredRoles: z.array(z.string()).default([]),
});

type LevelingConfig = z.infer<typeof LevelingConfigSchema>;

function formatList(lines: string[], empty: string, limit = 15): string {
  if (lines.length === 0) return empty;
  const shown = lines.slice(0, limit).join("\n");
  return lines.length > limit ? `${shown}\n-# ...and ${lines.length - limit} more` : shown;
}

async function addXp(services: any, guildId: string, userId: string, xp: number, config: LevelingConfig) {
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

  if (!user) return { leveledUp: false, newLevel: 0, oldLevel: 0 };
  
  const totalXp = Number(user.totalXp) + xp;
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

    return { leveledUp: newLevel > user.level, newLevel, oldLevel: user.level };
  }

  return { leveledUp: false, newLevel: user.level, oldLevel: user.level };
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

    const config = await services.config.get(guildId, "leveling") as any ?? {};
    const xpPerMessage = config.xpPerMessage ?? 15;

    const rank = await services.db.prisma.levelingUser.count({
      where: { guildId, xp: { gt: user.xp } },
    }) + 1;

    const xp = Number(user.xp);
    const currentLevelXp = xpForLevel(config.levelFormula, user.level);
    const nextLevelXp = xpForLevel(config.levelFormula, user.level + 1);
    const xpForNext = Math.max(0, nextLevelXp - xp);
    const progress = nextLevelXp > currentLevelXp
      ? Math.min(1, Math.max(0, (xp - currentLevelXp) / (nextLevelXp - currentLevelXp)))
      : 0;
    const filled = Math.round(progress * 10);
    const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;

    const body = [
      `**Level** — ${user.level}\n**Rank** — #${rank}\n**XP** — ${xp.toLocaleString()}`,
      `${bar} ${Math.round(progress * 100)}%`,
      `**To next level** — ${xpForNext.toLocaleString()} XP`,
    ];

    await interaction.reply(ephemeralCard(makeCard(AccentColors.purple, `📊 ${target.username}`, body, {
      subtitle: "Rank card",
      thumbnailUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
      footer: `${config.xpPerMessage ?? 15} XP per message · ${config.voiceXpPerMinute ?? 4} XP/min voice`,
    })));
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

  let orderBy: any = { xp: "desc" };
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
    const xp = Number(u.xp);
    const currentLevelXp = xpForLevel(config.levelFormula, u.level);
    const nextLevelXp = xpForLevel(config.levelFormula, u.level + 1);
    const xpForNext = Math.max(0, nextLevelXp - xp);
    return `**#${(page - 1) * 10 + i + 1}** ${name} — Level ${u.level} · ${xp.toLocaleString()} XP (${xpForNext.toLocaleString()} to next)`;
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

const levelSetDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("levelset")
    .setDescription("Configure leveling settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("xp-per-message").setDescription("Set base XP per message").addIntegerOption(o => o.setName("amount").setDescription("XP per message").setMinValue(1).setMaxValue(1000).setRequired(true)))
    .addSubcommand(s => s.setName("cooldown").setDescription("Set XP cooldown in seconds").addIntegerOption(o => o.setName("seconds").setDescription("Cooldown seconds").setMinValue(1).setMaxValue(3600).setRequired(true)))
    .addSubcommand(s => s.setName("voice-toggle").setDescription("Enable/disable voice XP").addBooleanOption(o => o.setName("enabled").setDescription("Enable voice XP").setRequired(true)))
    .addSubcommand(s => s.setName("voice-xp").setDescription("Set voice XP per minute").addIntegerOption(o => o.setName("amount").setDescription("XP per minute").setMinValue(1).setMaxValue(1000).setRequired(true)))
    .addSubcommand(s => s.setName("formula").setDescription("Set level formula").addStringOption(o => o.setName("formula").setDescription("Level formula").addChoices(
      { name: "Disgaea", value: "disgaea" },
      { name: "Fibonacci", value: "fibonacci" },
      { name: "Linear", value: "linear" },
      { name: "MEE6", value: "mee6" },
      { name: "Atlas", value: "atlas" },
      { name: "Arcane", value: "arcane" },
      { name: "Lurkr", value: "lurkr" },
    ).setRequired(true)))
    .addSubcommand(s => s.setName("announce").setDescription("Configure level-up announcements").addBooleanOption(o => o.setName("enabled").setDescription("Enable announcements").setRequired(true)).addChannelOption(o => o.setName("channel").setDescription("Announcement channel").setRequired(false)).addStringOption(o => o.setName("message").setDescription("Announcement message template").setRequired(false)))
    .addSubcommand(s => s.setName("min-length").setDescription("Set minimum message length for XP").addIntegerOption(o => o.setName("length").setDescription("Minimum characters").setMinValue(0).setMaxValue(500).setRequired(true)))
    .addSubcommand(s => s.setName("keep-xp").setDescription("Keep XP on leave").addBooleanOption(o => o.setName("enabled").setDescription("Keep XP on leave").setRequired(true)))
    .addSubcommand(s => s.setName("multiplier").setDescription("Set global XP multiplier").addNumberOption(o => o.setName("multiplier").setDescription("Global multiplier").setMinValue(0).setMaxValue(100).setRequired(true)))
    .addSubcommand(s => s.setName("add-role-reward").setDescription("Add a level role reward").addRoleOption(o => o.setName("role").setDescription("Role to give").setRequired(true)).addIntegerOption(o => o.setName("level").setDescription("Level required").setMinValue(1).setRequired(true)).addBooleanOption(o => o.setName("remove-previous").setDescription("Remove previous level roles").setRequired(false)))
    .addSubcommand(s => s.setName("remove-role-reward").setDescription("Remove a level role reward").addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true)))
    .addSubcommand(s => s.setName("add-multiplier").setDescription("Add XP multiplier role").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)).addNumberOption(o => o.setName("multiplier").setDescription("Multiplier (e.g. 1.5)").setMinValue(1).setMaxValue(10).setRequired(true)))
    .addSubcommand(s => s.setName("remove-multiplier").setDescription("Remove XP multiplier role").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand(s => s.setName("add-channel-multiplier").setDescription("Add XP multiplier channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)).addNumberOption(o => o.setName("multiplier").setDescription("Multiplier (e.g. 1.5)").setMinValue(1).setMaxValue(10).setRequired(true)))
    .addSubcommand(s => s.setName("remove-channel-multiplier").setDescription("Remove XP multiplier channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("ignore-channel").setDescription("Ignore a channel for XP").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("unignore-channel").setDescription("Unignore a channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("ignore-role").setDescription("Ignore a role for XP").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand(s => s.setName("unignore-role").setDescription("Unignore a role for XP").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand(s => s.setName("view").setDescription("View current settings")),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "leveling") as any ?? {};

    switch (sub) {
      case "xp-per-message": {
        const amount = interaction.options.getInteger("amount", true);
        config.xpPerMessage = amount;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**XP per message** — ${amount}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "cooldown": {
        const seconds = interaction.options.getInteger("seconds", true);
        config.cooldownSeconds = seconds;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**XP cooldown** — ${seconds}s`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "voice-toggle": {
        const enabled = interaction.options.getBoolean("enabled", true);
        config.voiceEnabled = enabled;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**Voice XP** — ${enabled ? "Enabled" : "Disabled"}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "voice-xp": {
        const amount = interaction.options.getInteger("amount", true);
        config.voiceXpPerMinute = amount;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**Voice XP per minute** — ${amount}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "formula": {
        const formula = interaction.options.getString("formula", true);
        config.levelFormula = formula;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**Level formula** — ${formula}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "announce": {
        const enabled = interaction.options.getBoolean("enabled", true);
        config.announceEnabled = enabled;
        if (interaction.options.getChannel("channel")) {
          config.announceChannel = interaction.options.getChannel("channel")!.id;
        }
        if (interaction.options.getString("message")) {
          config.announceMessage = interaction.options.getString("message")!;
        }
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Announcement settings updated", [
          `**Enabled** — ${enabled ? "Yes" : "No"}`,
          config.announceChannel ? `**Channel** — <#${config.announceChannel}>` : "",
          config.announceMessage ? `**Message** — ${config.announceMessage}` : "",
        ].filter(Boolean), { footer: "Leveling configuration" })));
        break;
      }
      case "min-length": {
        const length = interaction.options.getInteger("length", true);
        config.minMessageLength = length;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**Min message length** — ${length}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "keep-xp": {
        const enabled = interaction.options.getBoolean("enabled", true);
        config.keepXpOnLeave = enabled;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**Keep XP on leave** — ${enabled ? "Yes" : "No"}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "multiplier": {
        const mult = interaction.options.getNumber("multiplier", true);
        config.globalMultiplier = mult;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**Global multiplier** — ${mult}x`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "add-role-reward": {
        const role = interaction.options.getRole("role", true);
        const level = interaction.options.getInteger("level", true);
        const removePrevious = interaction.options.getBoolean("remove-previous") ?? false;
        config.roleRewards = config.roleRewards ?? [];
        config.roleRewards.push({ level, roleId: role.id, removePrevious });
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Role reward added", [
          `**Role** — ${role.name}`,
          `**Level** — ${level}`,
          `**Replaces previous** — ${removePrevious ? "Yes" : "No"}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "remove-role-reward": {
        const role = interaction.options.getRole("role", true);
        config.roleRewards = (config.roleRewards ?? []).filter((r: any) => r.roleId !== role.id);
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Role reward removed", [
          `**Role** — ${role.name}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "add-multiplier": {
        const role = interaction.options.getRole("role", true);
        const multiplier = interaction.options.getNumber("multiplier", true);
        config.multiplierRoles = config.multiplierRoles ?? [];
        config.multiplierRoles.push({ roleId: role.id, multiplier });
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Multiplier added", [
          `**Role** — ${role.name}`,
          `**Multiplier** — ${multiplier}x`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "remove-multiplier": {
        const role = interaction.options.getRole("role", true);
        config.multiplierRoles = (config.multiplierRoles ?? []).filter((r: any) => r.roleId !== role.id);
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Multiplier removed", [
          `**Role** — ${role.name}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "add-channel-multiplier": {
        const channel = interaction.options.getChannel("channel", true);
        const multiplier = interaction.options.getNumber("multiplier", true);
        config.channelMultipliers = config.channelMultipliers ?? [];
        config.channelMultipliers.push({ channelId: channel.id, multiplier });
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Channel multiplier added", [
          `**Channel** — ${channel.name}`,
          `**Multiplier** — ${multiplier}x`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "remove-channel-multiplier": {
        const channel = interaction.options.getChannel("channel", true);
        config.channelMultipliers = (config.channelMultipliers ?? []).filter((c: any) => c.channelId !== channel.id);
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Channel multiplier removed", [
          `**Channel** — ${channel.name}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "ignore-channel": {
        const channel = interaction.options.getChannel("channel", true);
        config.ignoredChannels = config.ignoredChannels ?? [];
        if (!config.ignoredChannels.includes(channel.id)) config.ignoredChannels.push(channel.id);
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Channel ignored", [
          `**Channel** — ${channel.name}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "unignore-channel": {
        const channel = interaction.options.getChannel("channel", true);
        config.ignoredChannels = (config.ignoredChannels ?? []).filter((id: string) => id !== channel.id);
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Channel unignored", [
          `**Channel** — ${channel.name}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "ignore-role": {
        const role = interaction.options.getRole("role", true);
        config.ignoredRoles = config.ignoredRoles ?? [];
        if (!config.ignoredRoles.includes(role.id)) config.ignoredRoles.push(role.id);
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Role ignored", [
          `**Role** — ${role.name}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "unignore-role": {
        const role = interaction.options.getRole("role", true);
        config.ignoredRoles = (config.ignoredRoles ?? []).filter((id: string) => id !== role.id);
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Role unignored", [
          `**Role** — ${role.name}`,
        ], { footer: "Leveling configuration" })));
        break;
      }
      case "view": {
        const roleRewards = formatList(
          (config.roleRewards ?? []).map((r: any) => `**Level ${r.level}** → <@&${r.roleId}>${r.removePrevious ? " · replaces previous" : ""}`),
          "*None configured*",
        );
        const multipliers = formatList(
          (config.multiplierRoles ?? []).map((r: any) => `<@&${r.roleId}> — **${r.multiplier}x**`),
          "*None configured*",
        );
        const channelMultipliers = formatList(
          (config.channelMultipliers ?? []).map((c: any) => `<#${c.channelId}> — **${c.multiplier}x**`),
          "*None configured*",
        );
        const ignoredChannels = formatList(
          (config.ignoredChannels ?? []).map((id: string) => `<#${id}>`),
          "*None configured*",
        );
        const ignoredRoles = formatList(
          (config.ignoredRoles ?? []).map((id: string) => `<@&${id}>`),
          "*None configured*",
        );

        const body = [
          `**XP per message** — ${config.xpPerMessage ?? 15}\n**Cooldown** — ${config.cooldownSeconds ?? 60}s`,
          `**Voice XP** — ${config.voiceEnabled ? "Enabled" : "Disabled"} (${config.voiceXpPerMinute ?? 4} XP/min)\n**Formula** — ${config.levelFormula ?? "disgaea"}`,
          `**Role rewards**\n${roleRewards}`,
          `**Role multipliers**\n${multipliers}`,
          `**Channel multipliers**\n${channelMultipliers}`,
          `**Ignored channels**\n${ignoredChannels}`,
          `**Ignored roles**\n${ignoredRoles}`,
          `**Announcements** — ${config.announceEnabled ? "Enabled" : "Disabled"}\n**Min message length** — ${config.minMessageLength ?? 4}\n**Keep XP on leave** — ${config.keepXpOnLeave ? "Yes" : "No"}\n**Global multiplier** — ${config.globalMultiplier ?? 1}x`,
        ];

        await interaction.reply(ephemeralCard(makeCard(undefined, "⚙️ Leveling Settings", body, {
          subtitle: interaction.guild?.name,
          footer: "Use /levelset to change these values",
        })));
        break;
      }
    }
  },
};

function getXpMultiplier(member: GuildMember, config: LevelingConfig): number {
  let multiplier = 1;
  for (const mr of config.multiplierRoles ?? []) {
    if (member.roles.cache.has(mr.roleId)) {
      multiplier = Math.max(multiplier, mr.multiplier);
    }
  }
  return multiplier;
}

const onMessageListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: any) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId;
    const config = await services.config.get(guildId, "leveling") as any ?? {};

    if (config.ignoredChannels?.includes(message.channelId)) return;
    if (message.member && config.ignoredRoles?.some((id: string) => message.member!.roles.cache.has(id))) return;

    const now = Date.now();
    const user = await services.db.prisma.levelingUser.findUnique({
      where: { guildId_userId: { guildId, userId: message.author.id } },
    });

    if (user && user.lastXpAt && now - new Date(user.lastXpAt).getTime() < (config.cooldownSeconds ?? 60) * 1000) {
      return;
    }

    const multiplier = message.member ? getXpMultiplier(message.member, config) : 1;
    const xp = Math.floor((config.xpPerMessage ?? 15) * multiplier);

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
    if (!(await services.modules.isEnabled(guildId, "leveling"))) return;
    const config = await getLevelingConfig(services, guildId);
    if (!config.voiceEnabled) return;
    
    const [was, is] = await Promise.all([
      isAudible(oldState),
      isAudible(newState),
    ]);
    if (was === is) return;
    
    if (is) {
      voiceSessionStart(guildId, member.id, Date.now());
      return;
    }
    
    const elapsed = voiceSessionEnd(guildId, member.id, Date.now());
    if (elapsed === null) return;
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return;
    
    await grantVoiceXp(services, guild, member, minutes, config);
  },
};

const levelingModule: ModuleDefinition = defineModule({
  name: "leveling",
  displayName: "Leveling",
  emoji: "📈",
  description: "XP, levels, role rewards, and leaderboards with voice XP support",
  version: "2.1.0",
  config: LevelingConfigSchema,
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
    { key: "ignoredChannels", label: "Ignored Channels", type: "multi-channel", description: "Channels where XP is disabled" },
    { key: "ignoredRoles", label: "Ignored Roles", type: "multi-role", description: "Roles that don't gain XP" },
  ],
  commands: [rankDef, leaderboardDef, levelSetDef],
  listeners: [onMessageListener, leaderboardListener, onVoiceStateListener],
  tasks: [],
  async onLoad(services) {
    console.log("[leveling] Module loaded");
    return [];
  },
  async onUnload(services) {
    console.log("[leveling] Module unloaded");
  },
});

export default levelingModule;
