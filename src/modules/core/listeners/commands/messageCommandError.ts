import { Listener, Events, type MessageCommandErrorPayload } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { cardFor, respondMessage } from './_shared.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandError })
export class MessageCommandErrorListener extends Listener<typeof Events.MessageCommandError> {
	public async run(error: unknown, { message, command }: MessageCommandErrorPayload) {
		const { card, expected } = cardFor(error);
		if (!expected) this.container.logger.error(`[MessageCommand:${command.name}]`, error);
		await respondMessage(message, card);
	}
}
