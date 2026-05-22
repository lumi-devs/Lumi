import { AllFlowsPrecondition } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { PermissionLevel, resolvePermissionLevel } from '#lib/permissions.js';
import { RedisKeys, RedisTTL } from '#database/redis.js';

interface CachedOverride {
	modelType: string;
	modelId: string;
	allow: boolean;
}

function chatInputCommandPath(interaction: ChatInputCommandInteraction): string {
	const parts = [interaction.commandName];
	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand(false);
	if (group) parts.push(group);
	if (sub) parts.push(sub);
	return parts.join(':');
}

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 22 })
export class PermissionOverridesPrecondition extends AllFlowsPrecondition {
	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const level = await resolvePermissionLevel(interaction, this.container);
		if (level >= PermissionLevel.BOT_OWNER) return this.ok();
		if (!interaction.guild) return this.ok();
		if (interaction.guild.ownerId === interaction.user.id) return this.ok();
		return this.#checkOverrides(interaction.guild.id, chatInputCommandPath(interaction), {
			userId: interaction.user.id,
			channelId: interaction.channelId,
			roleIds: new Set(
				Array.isArray(interaction.member?.roles)
					? interaction.member.roles
					: [...((interaction.member?.roles as { cache: Map<string, unknown> } | undefined)?.cache.keys() ?? [])]
			),
			guild: interaction.guild
		});
	}

	public override async messageRun(message: Message) {
		if (!message.guild) return this.ok();
		const level = await resolvePermissionLevel(message, this.container);
		if (level >= PermissionLevel.BOT_OWNER) return this.ok();
		if (message.guild.ownerId === message.author.id) return this.ok();
		return this.#checkOverrides(message.guild.id, message.content.split(' ')[0]?.replace(/^,/, '') ?? '', {
			userId: message.author.id,
			channelId: message.channelId,
			roleIds: new Set(message.member?.roles.cache.keys() ?? []),
			guild: message.guild
		});
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.guild) return this.ok();
		const level = await resolvePermissionLevel(interaction, this.container);
		if (level >= PermissionLevel.BOT_OWNER) return this.ok();
		if (interaction.guild.ownerId === interaction.user.id) return this.ok();
		return this.#checkOverrides(interaction.guild.id, interaction.commandName, {
			userId: interaction.user.id,
			channelId: interaction.channelId,
			roleIds: new Set(
				Array.isArray(interaction.member?.roles)
					? interaction.member.roles
					: [...((interaction.member?.roles as { cache: Map<string, unknown> } | undefined)?.cache.keys() ?? [])]
			),
			guild: interaction.guild
		});
	}

	async #checkOverrides(
		guildId: string,
		commandPath: string,
		ctx: {
			userId: string;
			channelId: string;
			roleIds: Set<string>;
			guild: { channels: { cache: Map<string, { parentId?: string | null }> }; roles: { cache: Map<string, { position: number }> } };
		}
	) {
		if (!commandPath) return this.ok();

		const cacheKey = RedisKeys.permOverrides(commandPath, guildId);
		const cached = await this.container.redis.get(cacheKey);

		let overrides: CachedOverride[];
		if (cached === null) {
			const settings = await this.container.prisma.permissionOverride.findMany({ where: { guildId, commandPath } });
			overrides = settings.map((r) => ({ modelType: r.modelType, modelId: r.modelId, allow: r.allow }));
			await this.container.redis.set(cacheKey, JSON.stringify(overrides), 'EX', RedisTTL.permOverrides);
		} else {
			overrides = JSON.parse(cached) as CachedOverride[];
		}

		if (overrides.length === 0) return this.ok();

		const { userId, channelId, roleIds, guild } = ctx;

		// User override
		const userOverride = overrides.find((o) => o.modelType === 'user' && o.modelId === userId);
		if (userOverride) return userOverride.allow ? this.ok() : this.error({ message: 'You are not permitted to use this command.' });

		// Channel override
		const channelOverride = overrides.find((o) => o.modelType === 'channel' && o.modelId === channelId);
		if (channelOverride) return channelOverride.allow ? this.ok() : this.error({ message: 'This command is not permitted in this channel.' });

		// Category override
		const channel = guild.channels.cache.get(channelId);
		const categoryId = channel && 'parentId' in channel ? (channel as { parentId?: string | null }).parentId : null;
		if (categoryId) {
			const categoryOverride = overrides.find((o) => o.modelType === 'category' && o.modelId === categoryId);
			if (categoryOverride)
				return categoryOverride.allow ? this.ok() : this.error({ message: 'This command is not permitted in this category.' });
		}

		// Role overrides — highest position wins, first match short-circuits
		const sortedRoles = [...roleIds]
			.map((id) => ({ id, position: guild.roles.cache.get(id)?.position ?? 0 }))
			.sort((a, b) => b.position - a.position);
		for (const { id } of sortedRoles) {
			const match = overrides.find((o) => o.modelType === 'role' && o.modelId === id);
			if (match) return match.allow ? this.ok() : this.error({ message: 'You are not permitted to use this command.' });
		}

		// Everyone override
		const everyoneOverride = overrides.find((o) => o.modelType === 'everyone');
		if (everyoneOverride) return everyoneOverride.allow ? this.ok() : this.error({ message: 'This command has been disabled.' });

		return this.ok();
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		PermissionOverrides: never;
	}
}
