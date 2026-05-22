import { ApplyOptions } from '@sapphire/decorators';
import { Module, type ModuleOptions } from '#core/module-system/Module.js';
import { FieldType, type ModuleMeta } from '#lib/module-system.js';
import { humanizeDelta } from '#utilities/time.js';
import { readModuleConfig } from '#database/settings/guild.js';
import { removeAfkAllForUser } from '#database/settings/afk.js';

export * from '#database/settings/afk.js';

export const NICK_PREFIX = '[AFK] ';

export const AFK_MENTION_COOLDOWN_MS = 5_000;
export const AFK_WELCOME_COOLDOWN_MS = 5_000;
export const AFK_REMOVAL_COOLDOWN_MS = 2_000;
export const AFK_NICK_EDIT_COOLDOWN_MS = 1_000;

export function afkDurationSince(since: Date): string {
	return humanizeDelta(Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000)));
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

@ApplyOptions<ModuleOptions>({
	name: 'afk',
	displayName: 'AFK',
	emoji: '💤',
	version: '1.0.0',
	description: 'Set yourself AFK; mentions notify others and a prefix is added to your nickname.'
})
export class AfkModule extends Module {
	public override async deleteUserData(userId: string) {
		await removeAfkAllForUser(userId);
	}
}
