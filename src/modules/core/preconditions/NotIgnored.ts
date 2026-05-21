import { AllFlowsPrecondition } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { RedisKeys, RedisTTL } from '#lib/redis.js';

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 21 })
export class NotIgnoredPrecondition extends AllFlowsPrecondition {
	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) return this.ok();
		return this.#checkGuildChannel(interaction.guild.id, interaction.channelId);
	}

	public override messageRun(message: Message) {
		if (!message.guild) return this.ok();
		return this.#checkGuildChannel(message.guild.id, message.channelId);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.guild) return this.ok();
		return this.#checkGuildChannel(interaction.guild.id, interaction.channelId);
	}

	async #checkGuildChannel(guildId: string, channelId: string) {
		const guildKey = RedisKeys.guildIgnored(guildId);
		const channelKey = RedisKeys.channelIgnored(guildId, channelId);

		const [guildCached, channelCached] = await Promise.all([this.container.redis.get(guildKey), this.container.redis.get(channelKey)]);

		if (guildCached === '1') return this.error({ message: 'This server is not using Ember.' });
		if (channelCached === '1') return this.error({ message: 'Commands are disabled in this channel.' });
		if (guildCached !== null && channelCached !== null) return this.ok();

		const rows = await this.container.prisma.ignoreEntry.findMany({
			where: {
				guildId,
				OR: [{ channelId: null }, { channelId }]
			}
		});

		const isGuildIgnored = rows.some((r) => r.channelId === null);
		const isChannelIgnored = rows.some((r) => r.channelId === channelId);

		const pipe = this.container.redis.pipeline();
		pipe.set(guildKey, isGuildIgnored ? '1' : '0', 'EX', RedisTTL.ignoreCache);
		pipe.set(channelKey, isChannelIgnored ? '1' : '0', 'EX', RedisTTL.ignoreCache);
		await pipe.exec();

		if (isGuildIgnored) return this.error({ message: 'This server is not using Ember.' });
		if (isChannelIgnored) return this.error({ message: 'Commands are disabled in this channel.' });
		return this.ok();
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		NotIgnored: never;
	}
}
