import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ChatInputCommandSuccessPayload, type MessageCommandSuccessPayload } from '@sapphire/framework';
import { envParseBoolean } from '@skyra/env-utilities';
import { commandCounter, commandDuration } from '#lib/metrics/Prometheus.js';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandSuccess })
export class ChatInputCommandMetricsListener extends Listener<typeof Events.ChatInputCommandSuccess> {
	public run(payload: ChatInputCommandSuccessPayload) {
		if (!envParseBoolean('PROMETHEUS_ENABLED', false)) return;
		const { command } = payload;
		commandCounter.inc({ command: command.name, status: 'success' });
		commandDuration.observe({ command: command.name }, payload.duration / 1000);
	}
}

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandSuccess })
export class MessageCommandMetricsListener extends Listener<typeof Events.MessageCommandSuccess> {
	public run(payload: MessageCommandSuccessPayload) {
		if (!envParseBoolean('PROMETHEUS_ENABLED', false)) return;
		const { command } = payload;
		commandCounter.inc({ command: command.name, status: 'success' });
		commandDuration.observe({ command: command.name }, payload.duration / 1000);
	}
}
