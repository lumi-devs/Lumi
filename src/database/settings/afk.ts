import { container } from '@sapphire/framework';
import type { AfkEntry } from '@prisma/client';
import { RedisKeys, RedisTTL } from '../redis.js';

export const AFK_MAX_REASON_LENGTH = 100;

export function sanitizeReason(input: string | null | undefined): string {
	if (!input) return 'AFK';
	const flat = input
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.join(' ')
		.replace(/\s+/g, ' ');
	if (!flat) return 'AFK';
	return flat.length > AFK_MAX_REASON_LENGTH ? `${flat.slice(0, AFK_MAX_REASON_LENGTH - 3)}…` : flat;
}

export async function getAfk(guildId: string, userId: string): Promise<AfkEntry | null> {
	const key = RedisKeys.afk(guildId, userId);
	const cached = await container.redis.get(key);
	if (cached) {
		try {
			const parsed = JSON.parse(cached) as AfkEntry;
			return { ...parsed, since: new Date(parsed.since) };
		} catch {
			// fall through to DB
		}
	}
	const entry = await container.prisma.afkEntry.findUnique({
		where: { userId_guildId: { userId, guildId } }
	});
	if (entry) await cacheAfk(entry);
	return entry;
}

export async function setAfk(guildId: string, userId: string, reason: string): Promise<AfkEntry> {
	const entry = await container.prisma.afkEntry.upsert({
		where: { userId_guildId: { userId, guildId } },
		update: { reason: sanitizeReason(reason), since: new Date() },
		create: { userId, guildId, reason: sanitizeReason(reason) }
	});
	await cacheAfk(entry);
	return entry;
}

export async function removeAfk(guildId: string, userId: string): Promise<boolean> {
	try {
		await container.prisma.afkEntry.delete({ where: { userId_guildId: { userId, guildId } } });
	} catch {
		return false;
	}
	await container.invalidation.invalidate(RedisKeys.afk(guildId, userId));
	return true;
}

export interface AfkMention {
	authorId: string;
	authorName: string;
	channelId: string;
	messageId: string;
	ts: number;
}

const AFK_MENTIONS_MAX = 25;

export async function recordAfkMention(guildId: string, afkUserId: string, mention: AfkMention): Promise<void> {
	const key = RedisKeys.afkMentions(guildId, afkUserId);
	await container.redis
		.multi()
		.lpush(key, JSON.stringify(mention))
		.ltrim(key, 0, AFK_MENTIONS_MAX - 1)
		.expire(key, RedisTTL.afkMentions)
		.exec();
}

export async function getAfkMentions(guildId: string, afkUserId: string): Promise<AfkMention[]> {
	const raw = await container.redis.lrange(RedisKeys.afkMentions(guildId, afkUserId), 0, -1);
	const out: AfkMention[] = [];
	for (const item of raw) {
		try {
			out.push(JSON.parse(item) as AfkMention);
		} catch {
			// skip malformed
		}
	}
	return out;
}

export async function clearAfkMentions(guildId: string, afkUserId: string): Promise<void> {
	await container.invalidation.invalidate(RedisKeys.afkMentions(guildId, afkUserId));
}

export async function removeAfkAllForUser(userId: string): Promise<number> {
	const { count } = await container.prisma.afkEntry.deleteMany({ where: { userId } });
	const keys = await container.redis.keys(RedisKeys.afkAllForUserPattern(userId));
	if (keys.length) await container.invalidation.invalidate(...keys);
	return count;
}

async function cacheAfk(entry: AfkEntry): Promise<void> {
	await container.redis.setex(RedisKeys.afk(entry.guildId, entry.userId), RedisTTL.afkEntry, JSON.stringify(entry));
}

export async function isCooldownActive(key: string): Promise<boolean> {
	return (await container.redis.exists(key)) === 1;
}

export async function armCooldown(key: string, ms: number): Promise<void> {
	await container.redis.set(key, '1', 'PX', ms);
}

export async function isRemovalCooldownActive(guildId: string, userId: string): Promise<boolean> {
	return isCooldownActive(RedisKeys.afkRemovalCooldown(guildId, userId));
}

export async function isWelcomeCooldownActive(channelId: string): Promise<boolean> {
	return isCooldownActive(RedisKeys.afkWelcomeCooldown(channelId));
}

export async function armWelcomeCooldown(channelId: string, ms: number): Promise<void> {
	await armCooldown(RedisKeys.afkWelcomeCooldown(channelId), ms);
}

export async function isMentionCooldownActive(channelId: string): Promise<boolean> {
	return isCooldownActive(RedisKeys.afkMentionCooldown(channelId));
}

export async function armMentionCooldown(channelId: string, ms: number): Promise<void> {
	await armCooldown(RedisKeys.afkMentionCooldown(channelId), ms);
}

export async function isNickEditCooldownActive(userId: string): Promise<boolean> {
	return isCooldownActive(RedisKeys.afkNickEditCooldown(userId));
}

export async function armNickEditCooldown(userId: string, ms: number): Promise<void> {
	await armCooldown(RedisKeys.afkNickEditCooldown(userId), ms);
}

export async function armRemovalCooldown(guildId: string, userId: string, ms: number): Promise<void> {
	await armCooldown(RedisKeys.afkRemovalCooldown(guildId, userId), ms);
}

export async function getAfkEntriesForGuild(guildId: string, limit = 50) {
	return container.prisma.afkEntry.findMany({
		where: { guildId },
		take: limit
	});
}

export interface AfkStats {
	activeEntries: number;
	activeCooldowns: number;
}

export async function getAfkStats(): Promise<AfkStats> {
	const keys = await container.redis.keys('ember:afk:*');
	const cdKeys = await container.redis.keys('ember:afk:cd:*');
	return {
		activeEntries: keys.length,
		activeCooldowns: cdKeys.length
	};
}

export async function getAllAfkEntries() {
	return container.prisma.afkEntry.findMany();
}
