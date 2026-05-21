import { Listener, Events, container } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { Guild } from 'discord.js';
import { readSettings } from '#lib/database/settings.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class GuildCreateListener extends Listener<typeof Events.GuildCreate> {
	public async run(guild: Guild) {
		container.logger.info(`[Guild] Joined: ${guild.name} (${guild.id})`);
		await readSettings(guild.id);
	}
}
