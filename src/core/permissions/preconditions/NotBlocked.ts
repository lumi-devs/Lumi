import { AllFlowsPrecondition } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { RedisKeys, RedisTTL } from '#database/redis.js';

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 20 })
export class NotBlockedPrecondition extends AllFlowsPrecondition {
	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return this.#check(interaction.user.id, interaction.guild?.id ?? null);
	}

	public override messageRun(message: Message) {
		return this.#check(message.author.id, message.guild?.id ?? null);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.#check(interaction.user.id, interaction.guild?.id ?? null);
	}

	async #check(userId: string, guildId: string | null) {
		const globalKey = RedisKeys.blocked(null, userId);
		const guildKey = guildId ? RedisKeys.blocked(guildId, userId) : null;

		const [globalCached, guildCached] = await Promise.all([
			this.container.redis.get(globalKey),
			guildKey ? this.container.redis.get(guildKey) : Promise.resolve(null)
		]);

		if (globalCached === '1' || guildCached === '1') {
			return this.error({ message: 'You are not allowed to use this bot.' });
		}
		if (globalCached === '0' && (guildKey === null || guildCached === '0')) {
			return this.ok();
		}

		const block = await this.container.prisma.blocklist.findFirst({
			where: {
				userId,
				OR: [{ guildId: '0' }, { guildId: guildId ?? '0' }]
			}
		});
		const isBlocked = block !== null;

		const pipe = this.container.redis.pipeline();
		pipe.setex(globalKey, RedisTTL.blockedCache, isBlocked ? '1' : '0');
		if (guildKey) pipe.setex(guildKey, RedisTTL.blockedCache, isBlocked ? '1' : '0');
		await pipe.exec();

		return isBlocked ? this.error({ message: 'You are not allowed to use this bot.' }) : this.ok();
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		NotBlocked: never;
	}
}
