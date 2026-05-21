import { Listener, Events, type ContextMenuCommandErrorPayload } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { RepliableInteraction } from 'discord.js';
import { cardFor, respond } from './_shared.js';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandError })
export class ContextMenuCommandErrorListener extends Listener<typeof Events.ContextMenuCommandError> {
	public async run(error: unknown, { interaction, command }: ContextMenuCommandErrorPayload) {
		const { card, expected } = cardFor(error);
		if (!expected) this.container.logger.error(`[ContextMenu:${command.name}]`, error);
		await respond(interaction as RepliableInteraction, card);
	}
}
