import { container } from "@sapphire/framework";
import { RedisKeys, RedisTTL } from "#database/redis.js";
import { enqueueJob } from "#lib/rabbit.js";
import type { GuildVerificationLevel } from "discord.js";

export async function recordRaidJoin(
  guildId: string,
  windowSeconds: number,
): Promise<number> {
  const key = RedisKeys.raidJoins(guildId);
  const now = Date.now();
  const ms = windowSeconds * 1000;

  const results = await container.redis
    .pipeline()
    .zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`)
    .zremrangebyscore(key, "-inf", now - ms)
    .expire(key, windowSeconds + RedisTTL.raidWindow)
    .zcount(key, now - ms, "+inf")
    .exec();

  if (!results) return 0;
  const zcountResult = results[results.length - 1]!;
  if (zcountResult[0]) throw zcountResult[0];
  return zcountResult[1] as number;
}

export async function isGuildRaidLocked(guildId: string): Promise<boolean> {
  return (await container.redis.exists(RedisKeys.raidLocked(guildId))) === 1;
}

export async function lockGuildForRaid(
  guildId: string,
  level: GuildVerificationLevel,
  minutes: number,
): Promise<void> {
  const unlocksAt = new Date(Date.now() + minutes * 60_000);
  await container.prisma.raidLockdown.upsert({
    where: { guildId },
    update: { originalLevel: level, unlocksAt },
    create: { guildId, originalLevel: level, unlocksAt },
  });
  await container.redis.set(
    RedisKeys.raidLocked(guildId),
    "1",
    "EX",
    minutes * 60 + 30,
  );
}

export async function unlockGuildFromRaid(guildId: string): Promise<void> {
  await container.prisma.raidLockdown.deleteMany({ where: { guildId } });
  await container.redis.del(RedisKeys.raidLocked(guildId));
}

export function scheduleRaidUnlock(
  guildId: string,
  level: GuildVerificationLevel,
  at: Date,
): void {
  if (!container.rabbit)
    return container.logger.warn(
      `[Raids] No RabbitMQ for guild ${guildId} unlock.`,
    );
  const delay = Math.max(0, at.getTime() - Date.now());
  void enqueueJob("UNLOCK_GUILD", { guildId, originalLevel: level }, delay);
}

export function getAllRaidLockdowns(): Promise<
  { guildId: string; originalLevel: number; unlocksAt: Date }[]
> {
  return container.prisma.raidLockdown.findMany();
}
