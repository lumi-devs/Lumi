import type { ModuleServices } from "@lumi/module-kit";
import { makeSuccessCard } from "@lumi/ui";
import type { Guild, GuildMember } from "discord.js";
import { type LevelingConfig, type LevelReward, rolesEarnXp } from "./config.js";
import { levelForTotalXp, levelProgress } from "./formulas.js";

interface GrantXpInput {
  guildId: string;
  userId: string;
  amount: number;
  member?: GuildMember | null;
  guild?: Guild | null;
  messageCount?: number;
  voiceMinutes?: number;
  lastXpAt?: Date;
  fallbackChannelId?: string | null;
}

function earnedRewards(
  rewards: LevelReward[],
  level: number,
): LevelReward[] {
  return rewards
    .filter((reward) => reward.level <= level)
    .sort((a, b) => a.level - b.level);
}

export async function applyRewardRoles(
  services: ModuleServices,
  config: LevelingConfig,
  member: GuildMember,
  level: number,
): Promise<void> {
  const earned = earnedRewards(config.roleRewards, level);
  if (earned.length === 0) return;

  if (!config.roleStack) {
    const highest = earned[earned.length - 1];
    if (!highest) return;

    for (const reward of earned) {
      if (
        reward.roleId !== highest.roleId &&
        member.roles.cache.has(reward.roleId)
      ) {
        await member.roles
          .remove(reward.roleId, "Stacking disabled")
          .catch(() => undefined);
      }
    }
    if (!member.roles.cache.has(highest.roleId)) {
      await member.roles
        .add(highest.roleId, "Level reward")
        .catch((error: unknown) =>
          services.observability?.logger?.warn?.(
            "[leveling] failed to grant reward role",
            { roleId: highest.roleId, userId: member.id, error },
          ),
        );
    }
    return;
  }

  for (const reward of earned) {
    if (reward.removePrevious) {
      for (const previous of earned) {
        if (
          previous.level < reward.level &&
          member.roles.cache.has(previous.roleId)
        ) {
          await member.roles
            .remove(previous.roleId, "Level reward replaced")
            .catch(() => undefined);
        }
      }
    }

    if (member.roles.cache.has(reward.roleId)) continue;
    await member.roles
      .add(reward.roleId, "Level reward")
      .catch((error: unknown) =>
        services.observability?.logger?.warn?.(
          "[leveling] failed to grant reward role",
          { roleId: reward.roleId, userId: member.id, error },
        ),
      );
  }
}

function formatAnnouncement(
  config: LevelingConfig,
  userId: string,
  level: number,
  totalXp: number,
): string {
  const progress = levelProgress(config.levelFormula, totalXp, level);
  return config.announceMessage
    .replace("{user}", `<@${userId}>`)
    .replace("{level}", String(level))
    .replace("{xp}", totalXp.toLocaleString())
    .replace("{xpNeeded}", progress.xpForNext.toLocaleString());
}

async function announceLevelUp(
  services: ModuleServices,
  config: LevelingConfig,
  guild: Guild,
  input: GrantXpInput,
  level: number,
  totalXp: number,
): Promise<void> {
  if (!config.announceEnabled) return;

  const channelId = config.announceChannel ?? input.fallbackChannelId ?? null;
  let channel = channelId ? guild.channels.cache.get(channelId) : undefined;
  if (channelId && !channel) {
    channel =
      (await guild.channels.fetch(channelId).catch(() => null)) ?? undefined;
  }
  if (!channel) channel = guild.systemChannel ?? undefined;
  if (!channel?.isTextBased()) return;

  const content = formatAnnouncement(config, input.userId, level, totalXp);
  await channel
    .send(makeSuccessCard("🎉 Level Up", content))
    .catch((error: unknown) =>
      services.observability?.logger?.warn?.(
        "[leveling] failed to send level-up announcement",
        { guildId: input.guildId, userId: input.userId, error },
      ),
    );
}

export async function grantXp(
  services: ModuleServices,
  config: LevelingConfig,
  input: GrantXpInput,
): Promise<void> {
  if (input.amount <= 0) return;

  const user = await services.db.prisma.levelingUser.upsert({
    where: {
      guildId_userId: { guildId: input.guildId, userId: input.userId },
    },
    update: {
      xp: { increment: input.amount },
      totalXp: { increment: input.amount },
      ...(input.messageCount
        ? { messageCount: { increment: input.messageCount } }
        : {}),
      ...(input.voiceMinutes
        ? { voiceMinutes: { increment: input.voiceMinutes } }
        : {}),
      ...(input.lastXpAt ? { lastXpAt: input.lastXpAt } : {}),
    },
    create: {
      guildId: input.guildId,
      userId: input.userId,
      xp: input.amount,
      totalXp: input.amount,
      level: 1,
      messageCount: input.messageCount ?? 0,
      voiceMinutes: input.voiceMinutes ?? 0,
      lastXpAt: input.lastXpAt ?? null,
    },
  });

  const totalXp = Number(user.totalXp);
  const { level } = levelForTotalXp(config.levelFormula, totalXp);
  if (level <= user.level) return;

  await services.db.prisma.levelingUser.update({
    where: {
      guildId_userId: { guildId: input.guildId, userId: input.userId },
    },
    data: { level },
  });

  const member =
    input.member ??
    (input.guild
      ? await input.guild.members
          .fetch(input.userId)
          .catch(() => null)
      : null);

  if (member) {
    await applyRewardRoles(services, config, member, level);
  }

  const guild =
    input.guild ?? member?.guild ?? null;
  if (guild) {
    await announceLevelUp(services, config, guild, input, level, totalXp);
  }
}

export async function grantVoiceXp(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  minutes: number,
  config: LevelingConfig,
): Promise<void> {
  if (!rolesEarnXp(config, member.roles.cache.keys())) return;

  const amount = Math.max(
    1,
    Math.round(config.voiceXpPerMinute * minutes * config.globalMultiplier),
  );

  await grantXp(services, config, {
    guildId: guild.id,
    userId: member.id,
    amount,
    member,
    guild,
    voiceMinutes: minutes,
    fallbackChannelId: member.voice.channelId,
  });
}
