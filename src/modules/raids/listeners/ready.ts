import { Listener, Events, container } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { raidUnlock, scheduleRaidUnlock } from '../index.js';

@ApplyOptions<Listener.Options>({ name: 'raids.ready', event: Events.ClientReady, once: true })
export class RaidsReadyListener extends Listener<typeof Events.ClientReady> {
	public async run() {
		const lockdowns = await container.prisma.raidLockdown.findMany();

		for (const record of lockdowns) {
			const guild = container.client.guilds.cache.get(record.guildId);
			if (!guild) continue;

			const unlocksAt = new Date(record.unlocksAt);
			if (unlocksAt.getTime() <= Date.now()) {
				await raidUnlock(guild, record.originalLevel);
			} else {
				scheduleRaidUnlock(guild, record.originalLevel, unlocksAt);
			}
		}
	}
}
