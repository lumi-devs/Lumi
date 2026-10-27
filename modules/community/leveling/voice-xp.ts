import type { Guild, GuildMember } from "discord.js";
import type { LevelingConfig, LevelReward } from "./config.js";
import { levelForTotalXp } from "./formulas.js";

async function applyRoleRewards(
  services: any,
  _guild: Guild,
  member: GuildMember,
  rewards: LevelReward[],
  newLevel: number,
): Promise<void> {
  for (const reward of rewards) {
    if (newLevel < reward.level) continue;
    if (member.roles.cache.has(reward.roleId)) continue;
    try {
      await member.roles.add(reward.roleId, "Level reward");
    } catch (error) {
      services.observability?.logger?.warn?.(
        `[leveling] failed to grant role ${reward.roleId} to ${member.id}: ${String(error)}`,
      );
    }
  }
}

export async function grantVoiceXp(
  services: any,
  guild: Guild,
  member: GuildMember,
  minutes: number,
  config: LevelingConfig,
): Promise<void> {
  const amount = Math.max(
    1,
    Math.round(
      config.voiceXpPerMinute * minutes * config.globalMultiplier,
    ),
  );

  const user = await services.db.prisma.levelingUser.upsert({
    where: { guildId_userId: { guildId: guild.id, userId: member.id } },
    update: {
      xp: { increment: amount },
      totalXp: { increment: amount },
      voiceMinutes: { increment: minutes },
    },
    create: {
      guildId: guild.id,
      userId: member.id,
      xp: amount,
      totalXp: amount,
      voiceMinutes: minutes,
      level: 1,
    },
  });

  const { level } = levelForTotalXp(config.formula, Number(user.totalXp));
  if (level <= user.level) return;

  await services.db.prisma.levelingUser.update({
    where: { guildId_userId: { guildId: guild.id, userId: member.id } },
    data: { level },
  });

  const rewards = config.levelRewards;
  const highest = rewards.reduce(
    (best, reward) => (reward.level > best.level ? reward : best),
    { level: 0, roleId: "" } as LevelReward,
  );
  if (highest.level > 0) {
    if (!config.roleStack) {
      for (const reward of rewards) {
        if (
          reward.level < highest.level &&
          member.roles.cache.has(reward.roleId)
        ) {
          await member.roles.remove(reward.roleId, "Stacking disabled").catch(() => undefined);
        }
      }
    }
    await applyRoleRewards(services, guild, member, rewards, level);
  }

  if (config.announceEnabled) {
    const channelId = config.announceChannelId ?? member.voice.channelId;
    const channel = channelId
      ? guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null))
      : guild.systemChannel;
    if (channel?.isTextBased()) {
      await channel.send({
        content: config.announceMessage
          .replace("{user}", `<@${member.id}>`)
          .replace("{level}", String(level))
          .replace("{xp}", Number(user.xp).toLocaleString())
          .replace("{xpNeeded}", String(levelForTotalXp(config.formula, Number(user.totalXp)).xp)),
      }).catch(() => undefined);
    }
  }
}
