import { Listener, Events } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { bold, green } from 'colorette';
import { RedisKeys, RedisTTL } from '#lib/redis.js';

@ApplyOptions<Listener.Options>({ once: true, event: Events.ClientReady })
export class ReadyListener extends Listener<typeof Events.ClientReady> {
	public async run() {
		const { client, logger } = this.container;
		const tag = client.user?.tag ?? 'Unknown';
		const guilds = client.guilds.cache.size;
		const shardInfo = client.shard ? ` | Shard ${client.shard.ids.join(',')}` : '';

		logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		logger.info(` ${bold(green('Ember'))}  |  ${tag}  |  ${guilds} guild(s)${shardInfo}`);
		logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

		await this.#publishStats(guilds);
	}

	async #publishStats(guilds: number) {
		const stats = {
			tag: this.container.client.user?.tag,
			guilds,
			uptime: process.uptime(),
			memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
			nodeVersion: process.version,
			startedAt: new Date().toISOString()
		};
		await this.container.redis.setex(RedisKeys.botStats(), RedisTTL.botStats, JSON.stringify(stats));
	}
}
