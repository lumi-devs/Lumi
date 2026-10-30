import { requireGuildId as guildIdOf } from "@lumi/foundation";
import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import {
  AccentColors,
  type CardReply,
  createPaginationRow,
  ephemeralCard,
  formatPageFooter,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
} from "@lumi/ui";
import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  Events,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
  SlashCommandBuilder,
  type VoiceState,
} from "discord.js";
import {
  channelEarnsXp,
  getLevelingConfig,
  type LevelingConfig,
  rolesEarnXp,
} from "./config.js";
import { LevelingModuleName } from "./constants.js";
import { levelForTotalXp, levelProgress } from "./formulas.js";
import { applyRewardRoles, grantVoiceXp, grantXp } from "./level-up.js";
import { isAudible, voiceAudibleTransition } from "./voice-sessions.js";

async function requireGuildId(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  const guildId = guildIdOf(interaction.guildId);
  if (guildId) return guildId;

  await interaction.reply(
    ephemeralCard(
      makeErrorCard(
        "Server Only",
        "Leveling commands can only be used inside a server.",
      ),
    ),
  );
  return null;
}

const rankDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your or another user's level")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false),
    ),
  async execute(interaction, services) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = await requireGuildId(interaction);
    if (!guildId) return;

    const user = await services.db.prisma.levelingUser.findUnique({
      where: { guildId_userId: { guildId, userId: target.id } },
    });

    if (!user) {
      await interaction.reply(
        ephemeralCard(
          makeEmptyCard(
            "No XP yet",
            `${target.username} has not earned any XP.`,
            "Send a message or join a voice channel to start earning XP.",
          ),
        ),
      );
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
        "[leveling] rank card generation failed",
        { error },
      );
    }

    if (attachment) {
      await interaction.reply({
        ...ephemeralCard(
          makeCard(undefined, "", "", {
            headerImages: ["attachment://rank.png"],
            footer,
            noAccent: true,
          }),
        ),
        files: [attachment],
      });
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeCard(AccentColors.purple, target.username, body, options),
      ),
    );
  },
};

type LeaderboardType = "overall" | "voice";

function parseLeaderboardType(
  value: string | null | undefined,
): LeaderboardType {
  return value === "voice" ? "voice" : "overall";
}

async function renderLeaderboard(
  config: LevelingConfig,
  guild: Guild | null,
  guildId: string,
  requestedPage: number,
  services: ModuleServices,
  boardType: LeaderboardType = "overall",
): Promise<CardReply> {
  const perPage = 10;

  const orderBy =
    boardType === "voice"
      ? { voiceMinutes: "desc" as const }
      : { totalXp: "desc" as const };

  const total = await services.db.prisma.levelingUser.count({
    where: { guildId },
  });
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

  const lines = users.map(
    (
      u: { userId: string; totalXp: bigint; voiceMinutes: number },
      i: number,
    ) => {
      const member = guild?.members.cache.get(u.userId);
      const name = member?.user.tag ?? `Unknown (${u.userId})`;
      if (boardType === "voice") {
        return `**#${(page - 1) * perPage + i + 1}** ${name} — ${u.voiceMinutes.toLocaleString()} voice minutes`;
      }
      const totalXp = Number(u.totalXp);
      const { level } = levelForTotalXp(config.levelFormula, totalXp);
      const progress = levelProgress(config.levelFormula, totalXp, level);
      return `**#${(page - 1) * perPage + i + 1}** ${name} — Level ${progress.level} · ${totalXp.toLocaleString()} XP (${progress.xpForNext.toLocaleString()} to next)`;
    },
  );

  const title =
    boardType === "voice" ? "🎙️ Voice Leaderboard" : "🏆 XP Leaderboard";
  const color = boardType === "voice" ? AccentColors.cyan : AccentColors.gold;

  return makeCard(color, title, lines, {
    subtitle: guild?.name,
    footer: formatPageFooter(page - 1, totalPages, total),
    actionRows: [
      createPaginationRow({
        customIdPrefix: `leveling:lb:${boardType}`,
        currentPage: page - 1,
        totalPages,
      }),
    ],
  });
}

const leaderboardDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server XP leaderboard")
    .addIntegerOption((o) =>
      o
        .setName("page")
        .setDescription("Page number")
        .setMinValue(1)
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Leaderboard type")
        .addChoices(
          { name: "Overall XP", value: "overall" },
          { name: "Voice Minutes", value: "voice" },
        )
        .setRequired(false),
    ),
  async execute(interaction, services) {
    const page = interaction.options.getInteger("page") ?? 1;
    const boardType = parseLeaderboardType(
      interaction.options.getString("type"),
    );
    const guildId = await requireGuildId(interaction);
    if (!guildId) return;
    const config = await getLevelingConfig(services, guildId);
    const card = await renderLeaderboard(
      config,
      interaction.guild,
      guildId,
      page,
      services,
      boardType,
    );
    await interaction.reply(ephemeralCard(card));
  },
};

const leaderboardListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (
      !interaction.isButton() ||
      !interaction.customId.startsWith("leveling:lb:")
    )
      return;

    const [, , boardType, action, token] = interaction.customId.split(":");
    if (action !== "prev" && action !== "next") return;

    const page = Number.parseInt(token ?? "0", 10);
    const guildId = interaction.guildId;
    if (!Number.isFinite(page) || !guildId) return;

    await interaction.deferUpdate();
    const config = await getLevelingConfig(services, guildId);
    const card = await renderLeaderboard(
      config,
      interaction.guild,
      guildId,
      page + 1,
      services,
      parseLeaderboardType(boardType),
    );
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
  async handler(message: Message, services: ModuleServices) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId;
    const config = await getLevelingConfig(services, guildId);

    if (message.content.length < config.minMessageLength) return;
    if (!channelEarnsXp(config, message.channelId)) return;

    let member = message.member;
    if (
      !member &&
      (config.ignoredRoles.length > 0 || config.whitelistedRoles.length > 0)
    ) {
      member = await message.guild.members
        .fetch(message.author.id)
        .catch(() => null);
    }
    if (member && !rolesEarnXp(config, member.roles.cache.keys())) return;
    if (
      !member &&
      (config.ignoredRoles.length > 0 || config.whitelistedRoles.length > 0)
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

    const multiplier = member
      ? getXpMultiplier(member, config, message.channelId)
      : config.globalMultiplier;
    const xp = Math.floor(config.xpPerMessage * multiplier);
    if (xp <= 0) return;

    await grantXp(services, config, {
      guildId,
      userId: message.author.id,
      amount: xp,
      member,
      guild: message.guild,
      messageCount: 1,
      lastXpAt: new Date(),
      fallbackChannelId: message.channelId,
    });
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: Events.VoiceStateUpdate,
  async handler(
    oldState: VoiceState,
    newState: VoiceState,
    services: ModuleServices,
  ) {
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

const onMemberRemoveListener: ListenerDefinition = {
  event: Events.GuildMemberRemove,
  async handler(member: GuildMember, services: ModuleServices) {
    const guildId = member.guild.id;
    const config = await getLevelingConfig(services, guildId);
    if (config.keepXpOnLeave) return;

    await services.db.prisma.levelingUser
      .deleteMany({ where: { guildId, userId: member.id } })
      .catch((error: unknown) =>
        services.observability?.logger?.warn?.(
          "[leveling] failed to clear member XP on leave",
          { guildId, userId: member.id, error },
        ),
      );
  },
};

const onMemberAddListener: ListenerDefinition = {
  event: Events.GuildMemberAdd,
  async handler(member: GuildMember, services: ModuleServices) {
    const guildId = member.guild.id;
    const config = await getLevelingConfig(services, guildId);
    if (!config.keepXpOnLeave) return;

    const user = await services.db.prisma.levelingUser.findUnique({
      where: { guildId_userId: { guildId, userId: member.id } },
    });
    if (!user) return;

    const { level } = levelForTotalXp(
      config.levelFormula,
      Number(user.totalXp),
    );
    if (level <= 1) return;

    await applyRewardRoles(services, config, member, level);
  },
};

const levelingModule: ModuleDefinition = defineModule({
  name: LevelingModuleName,
  displayName: "Leveling",
  emoji: "📈",
  description:
    "XP, levels, role rewards, and leaderboards with voice XP support",
  version: "2.1.0",
  config: {},
  commands: [rankDef, leaderboardDef],
  listeners: [
    onMessageListener,
    leaderboardListener,
    onVoiceStateListener,
    onMemberAddListener,
    onMemberRemoveListener,
  ],
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
