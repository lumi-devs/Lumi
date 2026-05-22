import { Listener, Events, type ListenerErrorPayload } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';

@ApplyOptions<Listener.Options>({ event: Events.ListenerError })
export class ListenerErrorListener extends Listener<typeof Events.ListenerError> {
	public run(error: unknown, { piece }: ListenerErrorPayload) {
		this.container.logger.error(`[Listener:${piece.name}]`, error);
	}
}
