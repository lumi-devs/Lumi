import { Listener, Events, type InteractionHandlerParseError } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';

@ApplyOptions<Listener.Options>({ event: Events.InteractionHandlerParseError })
export class InteractionHandlerParseErrorListener extends Listener<typeof Events.InteractionHandlerParseError> {
	public run(error: unknown, payload: InteractionHandlerParseError) {
		this.container.logger.error(`[InteractionHandlerParse:${payload.handler.name}]`, error);
	}
}
