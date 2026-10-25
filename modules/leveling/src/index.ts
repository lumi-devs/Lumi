import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  Message,
  GuildMember,
  Interaction,
  type Guild,
} from "discord.js";
import { defineModule, type CommandDefinition, type ModuleDefinition, type ListenerDefinition } from "@lumi/module-kit";
import {
  makeCard,
  makeSuccessCard,
  makeEmptyCard,
  ephemeralCard,
  createPaginationRow,
  formatPageFooter,
  BrandColors,
  type CardReply,
} from "@lumi/ui";
import { z } from "zod";

const LevelingConfigSchema = z.object({
  xpPerMessage: z.number().int().min(1).max(1000).default(15),
  xpPerMinuteVc: z.number().int().min(1).max(1000).default(10),
  cooldownSeconds: z.number().int().min(1).max(3600).default(60),
  xpCurve: z.record(z.number()).default({}),
  roleRewards: z.array(z.object({
    level: z.number().int().min(1),
    roleId: z.string(),
    removePrevious: z.boolean().default(false),
  })).default([]),
  multiplierRoles: z.array(z.object({
    roleId: z.string(),
    multiplier: z.number().positive().default(1.5),
  })).default([]),
  ignoredChannels: z.array(z.string()).default([]),
  ignoredRoles: z.array(z.string()).default([]),
});

type LevelingConfig = z.infer<typeof LevelingConfigSchema>;

function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100));
}

function xpForLevel(level: number): number {
  return level * level * 100;
}

function getXpMultiplier(member: GuildMember, config: LevelingConfig): number {
  let multiplier = 1;
  for (const mr of config.multiplierRoles ?? []) {
    if (member.roles.cache.has(mr.roleId)) {
      multiplier = Math.max(multiplier, mr.multiplier);
    }
  }
  return multiplier;
}

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
    },
    create: { 
      guildId, 
      userId, 
      xp, 
      totalXp: xp,
      level: calculateLevel(xp),
    },
  });

  const newLevel = calculateLevel(Number(user.xp));
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
        "Send a message to start earning XP.",
      )));
      return;
    }

    const config = await services.config.get(guildId, "leveling") as any ?? {};
    const xpPerMessage = config.xpPerMessage ?? 15;

    const rank = await services.db.prisma.levelingUser.count({
      where: { guildId, xp: { gt: user.xp } },
    }) + 1;

    const xp = Number(user.xp);
    const currentLevelXp = xpForLevel(user.level);
    const nextLevelXp = xpForLevel(user.level + 1);
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

    await interaction.reply(ephemeralCard(makeCard(BrandColors.purple, `📊 ${target.username}`, body, {
      subtitle: "Rank card",
      thumbnailUrl: target.displayAvatarURL({ size: 256, extension: "png" }),
      footer: `${xpPerMessage} XP per message`,
    })));
  },
};

async function renderLeaderboard(
  guild: Guild | null,
  guildId: string,
  requestedPage: number,
  services: any,
): Promise<CardReply> {
  const perPage = 10;

  const total = await services.db.prisma.levelingUser.count({ where: { guildId } });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  const users = await services.db.prisma.levelingUser.findMany({
    where: { guildId },
    orderBy: { xp: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
  });

  if (users.length === 0) {
    return makeEmptyCard(
      "No XP yet",
      "Nobody has earned XP in this server.",
      "Send a message to start earning XP.",
    );
  }

  const lines = users.map((u: any, i: number) => {
    const member = guild?.members.cache.get(u.userId);
    const name = member?.user.tag ?? `Unknown (${u.userId})`;
    return `**#${(page - 1) * perPage + i + 1}** ${name} — Level ${u.level} · ${u.xp.toLocaleString()} XP`;
  });

  return makeCard(BrandColors.gold, "🏆 XP Leaderboard", lines, {
    subtitle: guild?.name,
    footer: formatPageFooter(page - 1, totalPages, total),
    actionRows: [createPaginationRow({
      customIdPrefix: "leveling:lb",
      currentPage: page - 1,
      totalPages,
    })],
  });
}

const leaderboardDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server XP leaderboard")
    .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false)),
  async execute(interaction, services) {
    const page = interaction.options.getInteger("page") ?? 1;
    const card = await renderLeaderboard(interaction.guild, interaction.guildId!, page, services);
    await interaction.reply(ephemeralCard(card));
  },
};

const leaderboardListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: any) {
    if (!interaction.isButton() || !interaction.customId.startsWith("leveling:lb:")) return;

    const [, , action, token] = interaction.customId.split(":");
    if (action !== "prev" && action !== "next") return;

    const page = Number.parseInt(token ?? "0", 10);
    const guildId = interaction.guildId;
    if (!Number.isFinite(page) || !guildId) return;

    await interaction.deferUpdate();
    const card = await renderLeaderboard(interaction.guild, guildId, page + 1, services);
    await interaction.editReply(card);
  },
};

const levelSetDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("levelset")
    .setDescription("Configure leveling settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("xp-per-message").setDescription("Set base XP per message").addIntegerOption(o => o.setName("amount").setDescription("XP per message").setMinValue(1).setMaxValue(1000).setRequired(true)))
    .addSubcommand(s => s.setName("xp-per-minute-vc").setDescription("Set VC XP per minute").addIntegerOption(o => o.setName("amount").setDescription("XP per minute").setMinValue(1).setMaxValue(1000).setRequired(true)))
    .addSubcommand(s => s.setName("cooldown").setDescription("Set XP cooldown in seconds").addIntegerOption(o => o.setName("seconds").setDescription("Cooldown seconds").setMinValue(1).setMaxValue(3600).setRequired(true)))
    .addSubcommand(s => s.setName("add-role-reward").setDescription("Add a level role reward").addRoleOption(o => o.setName("role").setDescription("Role to give").setRequired(true)).addIntegerOption(o => o.setName("level").setDescription("Level required").setMinValue(1).setRequired(true)).addBooleanOption(o => o.setName("remove-previous").setDescription("Remove previous level roles").setRequired(false)))
    .addSubcommand(s => s.setName("remove-role-reward").setDescription("Remove a level role reward").addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true)))
    .addSubcommand(s => s.setName("add-multiplier").setDescription("Add XP multiplier role").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)).addNumberOption(o => o.setName("multiplier").setDescription("Multiplier (e.g. 1.5)").setMinValue(1).setMaxValue(10).setRequired(true)))
    .addSubcommand(s => s.setName("remove-multiplier").setDescription("Remove XP multiplier role").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
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
      case "xp-per-minute-vc": {
        const amount = interaction.options.getInteger("amount", true);
        config.xpPerMinuteVc = amount;
        await services.config.set(guildId, "leveling", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Setting updated", [
          `**XP per minute (VC)** — ${amount}`,
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
        const ignoredChannels = formatList(
          (config.ignoredChannels ?? []).map((id: string) => `<#${id}>`),
          "*None configured*",
        );
        const ignoredRoles = formatList(
          (config.ignoredRoles ?? []).map((id: string) => `<@&${id}>`),
          "*None configured*",
        );

        const body = [
          `**XP per message** — ${config.xpPerMessage ?? 15}\n**XP per minute (VC)** — ${config.xpPerMinuteVc ?? 10}\n**Cooldown** — ${config.cooldownSeconds ?? 60}s`,
          `**Role rewards**\n${roleRewards}`,
          `**Multipliers**\n${multipliers}`,
          `**Ignored channels**\n${ignoredChannels}`,
          `**Ignored roles**\n${ignoredRoles}`,
        ];

        await interaction.reply(ephemeralCard(makeCard(BrandColors.primary, "⚙️ Leveling Settings", body, {
          subtitle: interaction.guild?.name,
          footer: "Use /levelset to change these values",
        })));
        break;
      }
    }
  },
};

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

    const multiplier = message.member ? getXpMultiplier(message.member, { ...config, multiplierRoles: config.multiplierRoles ?? [] }) : 1;
    const xp = Math.floor((config.xpPerMessage ?? 15) * multiplier);

    await addXp(services, guildId, message.author.id, xp, config);

    await services.db.prisma.levelingUser.update({
      where: { guildId_userId: { guildId, userId: message.author.id } },
      data: { lastXpAt: new Date() },
    });
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(oldState, newState, services: any) {},
};

const levelingModule: ModuleDefinition = defineModule({
  name: "leveling",
  displayName: "Leveling",
  emoji: "📈",
  description: "XP, levels, role rewards, and leaderboards",
  version: "2.0.0",
  config: LevelingConfigSchema,
  configFields: [
    { key: "xpPerMessage", label: "XP per Message", type: "number", description: "Base XP per message" },
    { key: "xpPerMinuteVc", label: "XP per Minute in VC", type: "number", description: "Voice chat XP rate" },
    { key: "cooldownSeconds", label: "XP Cooldown", type: "number", description: "Seconds between XP gains" },
    { key: "roleRewards", label: "Role Rewards", type: "multi-role", description: "Roles granted at specific levels" },
    { key: "multiplierRoles", label: "XP Multiplier Roles", type: "multi-role", description: "Roles that boost XP gain" },
    { key: "ignoredChannels", label: "Ignored Channels", type: "multi-channel", description: "Channels where XP is disabled" },
    { key: "ignoredRoles", label: "Ignored Roles", type: "multi-role", description: "Roles that don't gain XP" },
  ],
  commands: [rankDef, leaderboardDef, levelSetDef],
  listeners: [onMessageListener, onVoiceStateListener, leaderboardListener],
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
