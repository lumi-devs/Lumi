import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ChatInputCommandErrorPayload, type MessageCommandErrorPayload } from '@sapphire/framework';
import { envParseBoolean } from '@skyra/env-utilities';
import { commandCounter } from '#lib/metrics/Prometheus.js';
import * as Sentry from '@sentry/node';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandError })
export class ChatInputCommandErrorMetricsListener extends Listener<typeof Events.ChatInputCommandError> {
	public run(error: unknown, payload: ChatInputCommandErrorPayload) {
		const { command } = payload;
		if (envParseBoolean('PROMETHEUS_ENABLED', false)) {
			commandCounter.inc({ command: command.name, status: 'error' });
		}
		if (envParseBoolean('SENTRY_ENABLED', false)) {
			Sentry.captureException(error, { tags: { command: command.name, type: 'chat-input' } });
		}
	}
}

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandError })
export class MessageCommandErrorMetricsListener extends Listener<typeof Events.MessageCommandError> {
	public run(error: unknown, payload: MessageCommandErrorPayload) {
		const { command } = payload;
		if (envParseBoolean('PROMETHEUS_ENABLED', false)) {
			commandCounter.inc({ command: command.name, status: 'error' });
		}
		if (envParseBoolean('SENTRY_ENABLED', false)) {
			Sentry.captureException(error, { tags: { command: command.name, type: 'message' } });
		}
	}
}
