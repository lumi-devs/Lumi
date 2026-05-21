import { container, type Container } from '@sapphire/framework';
import { envParseString } from '@skyra/env-utilities';
import type { Guild, GuildMember, Message, ChatInputCommandInteraction, ContextMenuCommandInteraction } from 'discord.js';
import { readSettings } from '#lib/database/settings.js';

export enum PermissionLevel {
	USER = 0,
	MOD = 5,
	ADMIN = 7,
	GUILD_OWNER = 8,
	BOT_OWNER = 10
}

export const PERMISSION_LEVEL_NAMES: Record<PermissionLevel, string> = {
	[PermissionLevel.USER]: 'User',
	[PermissionLevel.MOD]: 'Moderator',
	[PermissionLevel.ADMIN]: 'Administrator',
	[PermissionLevel.GUILD_OWNER]: 'Server Owner',
	[PermissionLevel.BOT_OWNER]: 'Bot Owner'
};

export type PermissionModelType = 'role' | 'user' | 'channel' | 'category' | 'everyone';

export interface PermissionContext {
	userId: string;
	guild: { id: string; ownerId: string };
	member: {
		roles: { cache: { has: (id: string) => boolean } };
		permissions: { has: (perm: unknown) => boolean };
	};
}

/**
 * Resolves the permission level of a user within a guild context.
 */
export async function resolvePermissionLevel(
	interactionOrMessage: Message | ChatInputCommandInteraction | ContextMenuCommandInteraction | PermissionContext,
	_container: Container = container
): Promise<PermissionLevel> {
	const userId = 'author' in interactionOrMessage ? interactionOrMessage.author.id : 'user' in interactionOrMessage ? interactionOrMessage.user.id : interactionOrMessage.userId;
	const guild = 'guild' in interactionOrMessage ? interactionOrMessage.guild as Guild | { id: string; ownerId: string } | null : null;
	const member = 'member' in interactionOrMessage ? interactionOrMessage.member as GuildMember | PermissionContext['member'] | null : null;

	// ── Bot owner check ───────────────────────────────────────────────────────
	const owners = envParseString('OWNER_IDS', '').split(',').map((s) => s.trim());
	if (owners.includes(userId)) return PermissionLevel.BOT_OWNER;

	if (!guild || !member) return PermissionLevel.USER;

	if (guild.ownerId === userId) return PermissionLevel.GUILD_OWNER;
	if (member.permissions.has('Administrator')) return PermissionLevel.ADMIN;

	try {
		const settings = await readSettings(guild.id);
		if (settings.adminRoleId && member.roles.cache.has(settings.adminRoleId)) {
			return PermissionLevel.ADMIN;
		}
		if (member.permissions.has('ManageMessages')) return PermissionLevel.MOD;
		if (settings.modRoleId && member.roles.cache.has(settings.modRoleId)) {
			return PermissionLevel.MOD;
		}
	} catch {
		// Database unavailable — fallback to basic Discord permissions
	}

	return PermissionLevel.USER;
}
