import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { EmberCommand } from '#lib/commands.js';
import { PermissionLevel, resolvePermissionLevel } from '#lib/permissions.js';
import { makeSuccessCard, makeInfoCard, makeErrorCard } from '#utilities/cards.js';
import { envParseString } from '#lib/env.js';
import { readSettings, writeSettings } from '#database/settings/guild.js';

@ApplyOptions<Command.Options>({
	name: 'prefix',
	description: 'View or change the bot prefix for this server.',
	preconditions: ['GuildOnly']
})
export class PrefixCommand extends EmberCommand {
	public override async messageRun(message: Message, args: Args): Promise<void> {
		const sub = await args.pick('string').catch(() => null);

		if (!sub) {
			return this.#show(message);
		}

		if (sub === 'set') {
			const newPrefix = await args.pick('string').catch(() => null);
			if (!newPrefix) {
				await message.reply({ ...makeErrorCard('Missing argument', 'Usage: `,prefix set <new_prefix>`') });
				return;
			}
			return this.#set(message, newPrefix);
		}

		if (sub === 'reset') {
			return this.#reset(message);
		}

		await message.reply({ ...makeErrorCard('Unknown subcommand', 'Usage: `,prefix`, `,prefix set <new>`, `,prefix reset`') });
	}

	async #show(message: Message): Promise<void> {
		const guildId = message.guild!.id;
		const settings = await readSettings(guildId);
		const defaultPrefix = envParseString('DEFAULT_PREFIX', ',');
		const current = settings.prefix ?? defaultPrefix;
		await message.reply({ ...makeInfoCard('Current Prefix', `The prefix for this server is \`${current}\`.`) });
	}

	async #set(message: Message, newPrefix: string): Promise<void> {
		const level = await resolvePermissionLevel(message, this.container);
		if (level < PermissionLevel.ADMIN) {
			await message.reply({ ...makeErrorCard('Forbidden', 'You need ADMIN permission to change the prefix.') });
			return;
		}
		if (newPrefix.length > 5) {
			await message.reply({ ...makeErrorCard('Invalid prefix', 'Prefix must be 5 characters or fewer.') });
			return;
		}
		const guildId = message.guild!.id;
		await writeSettings(guildId, { prefix: newPrefix });
		await message.reply({ ...makeSuccessCard('Prefix updated', `Server prefix is now \`${newPrefix}\`.`) });
	}

	async #reset(message: Message): Promise<void> {
		const level = await resolvePermissionLevel(message, this.container);
		if (level < PermissionLevel.ADMIN) {
			await message.reply({ ...makeErrorCard('Forbidden', 'You need ADMIN permission to reset the prefix.') });
			return;
		}
		const guildId = message.guild!.id;
		await writeSettings(guildId, { prefix: null });
		const defaultPrefix = envParseString('DEFAULT_PREFIX', ',');
		await message.reply({ ...makeSuccessCard('Prefix reset', `Server prefix reset to \`${defaultPrefix}\`.`) });
	}
}
