import { container } from '@sapphire/framework';
import { GuildVerificationLevel, type Guild } from 'discord.js';
import type { ModuleMeta } from '#lib/module-system.js';
import { FieldType } from '#lib/module-system.js';
import { RedisKeys, RedisTTL } from '#lib/redis.js';
import { enqueueJob, registerJobHandler } from '#lib/rabbit.js';

declare module '#lib/rabbit.js' {
	interface EmberJobs {
		UNLOCK_GUILD: { guildId: string; originalLevel: GuildVerificationLevel };
	}
}

export interface RaidConfig {
	joinWindowSeconds: number;
	joinThreshold: number;
	lockdownMinutes: number;
}

// ── Detection ───────────────────────────────────────────────────────────────
/**
 * Records a member join for velocity tracking.
 * Returns `true` if this join triggered a new lockdown.
 */
export async function checkRaidJoin(guild: Guild, config: RaidConfig): Promise<boolean> {
	const { redis } = container;
	const key = RedisKeys.raidJoins(guild.id);
	const now = Date.now();

	const pipeline = redis.pipeline();
	pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
	pipeline.zremrangebyscore(key, '-inf', now - config.joinWindowSeconds * 1000);
	pipeline.expire(key, config.joinWindowSeconds + RedisTTL.raidWindow);
	await pipeline.exec();

	const inWindow = await redis.zcount(key, now - config.joinWindowSeconds * 1000, '+inf');
	if (inWindow < config.joinThreshold) return false;

	if (await redis.exists(RedisKeys.raidLocked(guild.id))) return false;

	await raidLockdown(guild, config);
	return true;
}

// ── Lockdown lifecycle ──────────────────────────────────────────────────────
export async function raidLockdown(guild: Guild, config: RaidConfig): Promise<void> {
	const originalLevel = guild.verificationLevel;
	const unlocksAt = new Date(Date.now() + config.lockdownMinutes * 60_000);

	await container.prisma.raidLockdown.upsert({
		where: { guildId: guild.id },
		update: { originalLevel, unlocksAt },
		create: { guildId: guild.id, originalLevel, unlocksAt }
	});

	await container.redis.set(RedisKeys.raidLocked(guild.id), '1', 'EX', config.lockdownMinutes * 60 + 30);
	await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Raid detected — auto lockdown');

	scheduleRaidUnlock(guild, originalLevel, unlocksAt);
}

export function scheduleRaidUnlock(guild: Guild, originalLevel: GuildVerificationLevel, at: Date): void {
	if (!container.rabbit) {
		container.logger.warn(`[Raids] Cannot schedule unlock for guild ${guild.id} — RabbitMQ not configured. Manual unlock required.`);
		return;
	}
	const delay = Math.max(0, at.getTime() - Date.now());
	void enqueueJob('UNLOCK_GUILD', { guildId: guild.id, originalLevel }, delay);
}

export async function raidUnlock(guild: Guild, originalLevel: GuildVerificationLevel): Promise<void> {
	await guild.setVerificationLevel(originalLevel, 'Raid lockdown expired — auto restore');
	await container.prisma.raidLockdown.deleteMany({ where: { guildId: guild.id } });
	await container.redis.del(RedisKeys.raidLocked(guild.id));
	container.logger.info(`[Raids] Lockdown lifted in guild ${guild.name} (${guild.id})`);
}

// ── Module meta ─────────────────────────────────────────────────────────────
export const meta: ModuleMeta = {
	name: 'raids',
	displayName: 'Raid Protection',
	emoji: '🛡️',
	description: 'Detects mass-join raids and automatically raises server verification to Highest for a configurable duration.',
	configFields: [
		{ key: 'enabled', label: 'Enabled', type: FieldType.BOOLEAN, description: 'Enable automatic raid detection and lockdown.', default: false },
		{
			key: 'joinWindowSeconds',
			label: 'Join Window (seconds)',
			type: FieldType.NUMBER,
			description: 'Rolling time window used to measure join velocity.',
			default: 10
		},
		{
			key: 'joinThreshold',
			label: 'Join Threshold',
			type: FieldType.NUMBER,
			description: 'Number of joins within the window that triggers lockdown.',
			default: 10
		},
		{
			key: 'lockdownMinutes',
			label: 'Lockdown Duration (minutes)',
			type: FieldType.NUMBER,
			description: 'How long to hold the server at Highest verification before auto-restoring.',
			default: 30
		},
		{
			key: 'notifyChannelId',
			label: 'Alert Channel',
			type: FieldType.CHANNEL,
			description: 'Channel to post a lockdown alert in. Leave unset to skip notifications.',
			required: false
		}
	],
	onLoad() {
		registerJobHandler('UNLOCK_GUILD', async (data) => {
			const guild = container.client.guilds.cache.get(data.guildId);
			if (!guild) return;
			await raidUnlock(guild, data.originalLevel);
		});
	},
	async deleteUserData() {
		// No PII stored by this module.
	}
};
