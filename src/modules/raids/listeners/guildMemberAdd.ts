import { Listener, Events, container } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { GuildMember } from 'discord.js';
import { checkRaidJoin } from '../index.js';
import { readModuleConfig } from '#lib/database/settings.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class GuildMemberAddListener extends Listener<typeof Events.GuildMemberAdd> {
	public async run(member: GuildMember) {
		const { guild } = member;

		const enabled = (await readModuleConfig(guild.id, 'raids', 'enabled')) ?? false;
		if (!enabled) return;

		const triggered = await checkRaidJoin(guild, {
			joinWindowSeconds: (await readModuleConfig(guild.id, 'raids', 'joinWindowSeconds')) ?? 10,
			joinThreshold: (await readModuleConfig(guild.id, 'raids', 'joinThreshold')) ?? 10,
			lockdownMinutes: (await readModuleConfig(guild.id, 'raids', 'lockdownMinutes')) ?? 30
		});
		if (triggered) {
			container.logger.info(`[Raids] Lockdown triggered in ${guild.name} (${guild.id})`);
		}
	}
}
