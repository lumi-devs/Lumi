import { container } from '@sapphire/framework';
import type { AfkEntry } from '@prisma/client';
import { FieldType, type ModuleMeta } from '#lib/module-system.js';
import { RedisKeys, RedisTTL } from '#lib/redis.js';
import { humanizeDelta } from '#lib/time.js';
import { readModuleConfig } from '#lib/database/settings.js';

export const NICK_PREFIX = '[AFK] ';
export const AFK_MAX_REASON_LENGTH = 100;

export const AFK_MENTION_COOLDOWN_MS = 5_000;
export const AFK_WELCOME_COOLDOWN_MS = 5_000;
export const AFK_REMOVAL_COOLDOWN_MS = 2_000;
export const AFK_NICK_EDIT_COOLDOWN_MS = 1_000;

// ── Sanitisation ────────────────────────────────────────────────────────────
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

export function afkDurationSince(since: Date): string {
	return humanizeDelta(Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000)));
}

// ── Data access (cache-aside: Redis hot path, Postgres canonical) ───────────
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

// ── Mention tracking while AFK ──────────────────────────────────────────────
/** A single mention received by an AFK user. Keyed in Redis by the AFK user. */
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

// ── Cooldown primitive (millisecond-precision Redis SET PX) ─────────────────
export async function isCooldownActive(key: string): Promise<boolean> {
	return (await container.redis.exists(key)) === 1;
}

export async function armCooldown(key: string, ms: number): Promise<void> {
	await container.redis.set(key, '1', 'PX', ms);
}

// ── Config ──────────────────────────────────────────────────────────────────
export async function isAfkEnabled(guildId: string): Promise<boolean> {
	const value = await readModuleConfig(guildId, 'afk', 'enabled');
	return value === undefined || value === null ? true : Boolean(value);
}

export async function isAfkNickPrefixEnabled(guildId: string): Promise<boolean> {
	const value = await readModuleConfig(guildId, 'afk', 'nick_prefix_enabled');
	return value === undefined || value === null ? true : Boolean(value);
}

// ── Module meta ─────────────────────────────────────────────────────────────
export const meta: ModuleMeta = {
	name: 'afk',
	displayName: 'AFK',
	emoji: '💤',
	version: '1.0.0',
	description: 'Set yourself AFK; mentions notify others and a prefix is added to your nickname.',
	configFields: [
		{
			key: 'enabled',
			label: 'Enabled',
			type: FieldType.BOOLEAN,
			description: 'Master switch for the AFK module in this server.',
			default: true
		},
		{
			key: 'nick_prefix_enabled',
			label: 'Nickname Prefix',
			type: FieldType.BOOLEAN,
			description: 'Prepend [AFK] to nickname while AFK.',
			default: true
		}
	],
	async deleteUserData(userId) {
		await removeAfkAllForUser(userId);
	}
};
