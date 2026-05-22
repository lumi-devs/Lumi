import { ApplyOptions } from '@sapphire/decorators';
import { Module, type ModuleOptions } from '#core/module-system/Module.js';
import { container } from '@sapphire/framework';
import { GuildVerificationLevel, type Guild } from 'discord.js';
import { FieldType, type ModuleMeta } from '#lib/module-system.js';
import { registerJobHandler } from '#lib/rabbit.js';
import { addRaidJoin, isRaidLocked, setRaidLocked, clearRaidLockdown, scheduleRaidUnlock, type RaidConfig } from '#database/settings/raids.js';

export * from '#database/settings/raids.js';

declare module '#lib/rabbit.js' {
	interface EmberJobs {
		UNLOCK_GUILD: { guildId: string; originalLevel: GuildVerificationLevel };
	}
}

export { RaidConfig };

// ── Detection ───────────────────────────────────────────────────────────────
/**
 * Records a member join for velocity tracking.
 * Returns `true` if this join triggered a new lockdown.
 */
export async function checkRaidJoin(guild: Guild, config: RaidConfig): Promise<boolean> {
	const inWindow = await addRaidJoin(guild.id, config.joinWindowSeconds);
	if (inWindow < config.joinThreshold) return false;

	if (await isRaidLocked(guild.id)) return false;

	await raidLockdown(guild, config);
	return true;
}

// ── Lockdown lifecycle ──────────────────────────────────────────────────────
export async function raidLockdown(guild: Guild, config: RaidConfig): Promise<void> {
	const originalLevel = guild.verificationLevel;
	const unlocksAt = new Date(Date.now() + config.lockdownMinutes * 60_000);

	await setRaidLocked(guild.id, originalLevel, config.lockdownMinutes);
	await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Raid detected — auto lockdown');

	scheduleRaidUnlock(guild.id, originalLevel, unlocksAt);
}

export async function raidUnlock(guild: Guild, originalLevel: GuildVerificationLevel): Promise<void> {
	await guild.setVerificationLevel(originalLevel, 'Raid lockdown expired — auto restore');
	await clearRaidLockdown(guild.id);
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

@ApplyOptions<ModuleOptions>({
	name: 'raids',
	displayName: 'Raid Protection',
	emoji: '🛡️',
	description: 'Detects mass-join raids and automatically raises server verification to Highest for a configurable duration.'
})
export class RaidModule extends Module {
	public override onLoad() {
		registerJobHandler('UNLOCK_GUILD', async (data) => {
			const guild = this.container.client.guilds.cache.get(data.guildId);
			if (!guild) return;
			await raidUnlock(guild, data.originalLevel);
		});
	}
}
