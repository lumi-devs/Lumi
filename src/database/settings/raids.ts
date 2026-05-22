import { container } from '@sapphire/framework';
import type { GuildVerificationLevel } from 'discord.js';
import { RedisKeys, RedisTTL } from '../redis.js';
import { enqueueJob } from '#lib/rabbit.js';

export interface RaidConfig {
	joinWindowSeconds: number;
	joinThreshold: number;
	lockdownMinutes: number;
}

export async function addRaidJoin(guildId: string, windowSeconds: number): Promise<number> {
	const { redis } = container;
	const key = RedisKeys.raidJoins(guildId);
	const now = Date.now();

	const pipeline = redis.pipeline();
	pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
	pipeline.zremrangebyscore(key, '-inf', now - windowSeconds * 1000);
	pipeline.expire(key, windowSeconds + RedisTTL.raidWindow);
	await pipeline.exec();

	return redis.zcount(key, now - windowSeconds * 1000, '+inf');
}

export async function isRaidLocked(guildId: string): Promise<boolean> {
	return (await container.redis.exists(RedisKeys.raidLocked(guildId))) === 1;
}

export async function setRaidLocked(guildId: string, originalLevel: GuildVerificationLevel, lockdownMinutes: number): Promise<void> {
	const unlocksAt = new Date(Date.now() + lockdownMinutes * 60_000);

	await container.prisma.raidLockdown.upsert({
		where: { guildId },
		update: { originalLevel, unlocksAt },
		create: { guildId, originalLevel, unlocksAt }
	});

	await container.redis.set(RedisKeys.raidLocked(guildId), '1', 'EX', lockdownMinutes * 60 + 30);
}

export async function clearRaidLockdown(guildId: string): Promise<void> {
	await container.prisma.raidLockdown.deleteMany({ where: { guildId } });
	await container.redis.del(RedisKeys.raidLocked(guildId));
}

export function scheduleRaidUnlock(guildId: string, originalLevel: GuildVerificationLevel, at: Date): void {
	if (!container.rabbit) {
		container.logger.warn(`[Raids] Cannot schedule unlock for guild ${guildId} — RabbitMQ not configured. Manual unlock required.`);
		return;
	}
	const delay = Math.max(0, at.getTime() - Date.now());
	void enqueueJob('UNLOCK_GUILD', { guildId, originalLevel }, delay);
}

export async function getAllLockdowns() {
	return container.prisma.raidLockdown.findMany();
}
