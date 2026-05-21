import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command, container } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { EmberCommand } from '#lib/commands.js';
import { PermissionLevel } from '#lib/permissions.js';
import { EmberColors } from '#lib/branding.js';
import { makeCard, makeInfoCard, makeSuccessCard, makeWarningCard } from '#lib/cards.js';
import {
	NICK_PREFIX,
	AFK_MAX_REASON_LENGTH,
	AFK_REMOVAL_COOLDOWN_MS,
	afkDurationSince,
	getAfk,
	isAfkNickPrefixEnabled,
	removeAfk,
	sanitizeReason,
	setAfk,
	armCooldown
} from '../index.js';
import { RedisKeys } from '#lib/redis.js';

const OWNER_ONLY = {
	name: 'MinimumPermissionLevel' as const,
	context: { minimumPermissionLevel: PermissionLevel.BOT_OWNER }
};

@ApplyOptions<Command.Options>({
	name: 'afk',
	description: 'Set yourself AFK with an optional reason.',
	preconditions: ['GuildOnly', 'ModuleEnabled']
})
export class AfkCommand extends EmberCommand {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addStringOption((option) =>
					option
						.setName('reason')
						.setDescription('The reason for being AFK')
						.setMaxLength(AFK_MAX_REASON_LENGTH)
						.setRequired(false)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const reason = sanitizeReason(interaction.options.getString('reason') ?? 'AFK');
		const { guildId } = interaction;
		const userId = interaction.user.id;
		
		const existing = await getAfk(guildId!, userId);

		let title: string;
		let body: string;
		if (existing) {
			if (existing.reason === reason) {
				return this.replySuccess(interaction, 'Already AFK', `You are already AFK with the reason: **${reason}**`, { ephemeral: true });
			}
			await setAfk(guildId!, userId, reason);
			title = '✏️ AFK Updated';
			body = `AFK reason updated to: **${reason}**`;
		} else {
			await setAfk(guildId!, userId, reason);
			title = '✅ AFK Set';
			body = `You are now AFK: **${reason}**`;

			const { member } = interaction;
			if (member && (member as any).displayName && !(member as any).displayName.startsWith(NICK_PREFIX) && (await isAfkNickPrefixEnabled(guildId!))) {
				void (member as any).setNickname(`${NICK_PREFIX}${(member as any).displayName}`.slice(0, 32)).catch(() => null);
			}
		}

		await armCooldown(RedisKeys.afkRemovalCooldown(guildId!, userId), AFK_REMOVAL_COOLDOWN_MS);
		return this.replySuccess(interaction, title, body, { ephemeral: true });
	}

	public override async messageRun(message: Message, args: Args): Promise<void> {
		if (!message.inGuild()) return;

		const reason = sanitizeReason(await args.rest('string').catch(() => 'AFK'));
		void message.delete().catch(() => null);

		const { guildId } = message;
		const userId = message.author.id;
		const existing = await getAfk(guildId, userId);

		let title: string;
		let body: string;
		if (existing) {
			if (existing.reason === reason) return;
			await setAfk(guildId, userId, reason);
			title = '✏️ AFK Updated';
			body = `${message.author.toString()}, AFK reason updated to: **${reason}**`;
		} else {
			await setAfk(guildId, userId, reason);
			title = '✅ AFK Set';
			body = `${message.author.toString()}, you are now AFK: **${reason}**`;

			const { member } = message;
			if (member && !member.displayName.startsWith(NICK_PREFIX) && (await isAfkNickPrefixEnabled(guildId))) {
				void member.setNickname(`${NICK_PREFIX}${member.displayName}`.slice(0, 32)).catch(() => null);
			}
		}
		await armCooldown(RedisKeys.afkRemovalCooldown(guildId, userId), AFK_REMOVAL_COOLDOWN_MS);

		if (!message.channel.isSendable()) return;
		const sent = await message.channel
			.send({ ...makeWarningCard(title, body), allowedMentions: { parse: [] } })
			.catch(() => null);
		if (sent) setTimeout(() => sent.delete().catch(() => null), 20_000);
	}
}

@ApplyOptions<Command.Options>({
	name: 'afklist',
	description: 'List users currently AFK in this server (owner only).',
	preconditions: ['GuildOnly', OWNER_ONLY]
})
export class AfkListCommand extends EmberCommand {
	public override async messageRun(message: Message): Promise<void> {
		if (!message.inGuild()) return;
		const entries = await this.container.prisma.afkEntry.findMany({
			where: { guildId: message.guildId },
			take: 50
		});
		if (entries.length === 0) {
			await message.reply({
				...makeInfoCard('AFK List', 'No users are currently AFK in this server.'),
				allowedMentions: { parse: [] }
			});
			return;
		}
		const lines = entries.map((e) => `<@${e.userId}> — \`${e.reason}\` *(for ${afkDurationSince(e.since)})*`);
		await message.reply({
			...makeWarningCard('📜 AFK List', lines.join('\n'), {
				footer: `Total AFK in this server: ${entries.length}`
			}),
			allowedMentions: { parse: [] }
		});
	}
}

@ApplyOptions<Command.Options>({
	name: 'afkstats',
	description: 'Show AFK system stats (owner only).',
	preconditions: [OWNER_ONLY]
})
export class AfkStatsCommand extends EmberCommand {
	public override async messageRun(message: Message): Promise<void> {
		const keys = await this.container.redis.keys('ember:afk:*');
		const cdKeys = await this.container.redis.keys('ember:afk:cd:*');
		const body = `**Active AFK entries:** ${keys.length}\n**Active cooldowns:** ${cdKeys.length}`;
		await message.reply({ ...makeCard(EmberColors.PRIMARY, '📊 AFK System Stats', body), allowedMentions: { parse: [] } });
	}
}

@ApplyOptions<Command.Options>({
	name: 'afkclean',
	description: 'Remove AFK entries whose users are no longer cached (owner only).',
	preconditions: [OWNER_ONLY]
})
export class AfkCleanCommand extends EmberCommand {
	public override async messageRun(message: Message): Promise<void> {
		if (message.channel.isSendable()) {
			await message.channel
				.send({ ...makeInfoCard('AFK Cleanup', 'Cleaning up AFK entries…'), allowedMentions: { parse: [] } })
				.catch(() => null);
		}
		const entries = await container.prisma.afkEntry.findMany();
		let removed = 0;
		for (const entry of entries) {
			if (this.container.client.users.cache.has(entry.userId)) continue;
			if (await removeAfk(entry.guildId, entry.userId).catch(() => false)) removed++;
		}
		await message.reply({
			...makeSuccessCard('AFK Cleanup', `Removed ${removed} stale AFK entries.`),
			allowedMentions: { parse: [] }
		});
	}
}
