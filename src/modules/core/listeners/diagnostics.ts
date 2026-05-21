import { Listener, Events } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';

@ApplyOptions<Listener.Options>({ once: true, event: Events.ClientReady, name: 'diagnostics' })
export class DiagnosticsListener extends Listener<typeof Events.ClientReady> {
	public async run() {
		const { client, logger, moduleManager } = this.container;

		const redisBefore = Date.now();
		await this.container.redis.ping();
		const redisPing = `${Date.now() - redisBefore}ms`;

		const guilds = client.guilds.cache.size;
		const modules = moduleManager.all().length;
		const commands = this.container.stores.get('commands').size;
		const listeners = this.container.stores.get('listeners').size;

		const col1 = 18;
		const col2 = 14;

		const row = (label: string, value: string) => `│ ${label.padEnd(col1)}│ ${value.padEnd(col2)}│`;

		logger.info('┌─────────────────────────────────┐');
		logger.info('│  Ember Diagnostics              │');
		logger.info('├──────────────────┬──────────────┤');
		logger.info(row('Database', 'Prisma (PG)'));
		logger.info(row('Redis ping', redisPing));
		logger.info(row('Guilds', String(guilds)));
		logger.info(row('Modules loaded', String(modules)));
		logger.info(row('Commands', String(commands)));
		logger.info(row('Listeners', String(listeners)));
		logger.info('└──────────────────┴──────────────┘');
	}
}
