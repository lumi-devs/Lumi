import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type LogLevel } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import { envParseBoolean } from '@skyra/env-utilities';

@ApplyOptions<Listener.Options>({ event: Events.Log })
export class SentryBreadcrumbListener extends Listener<typeof Events.Log> {
	public run(level: LogLevel, message: string) {
		if (!envParseBoolean('SENTRY_ENABLED', false)) return;

		Sentry.addBreadcrumb({
			category: 'console',
			message,
			level: this.#parseLevel(level),
			type: 'debug'
		});
	}

	#parseLevel(level: LogLevel): Sentry.SeverityLevel {
		switch (level) {
			case 10: // TRACE
			case 20: // DEBUG
				return 'debug';
			case 30: // INFO
				return 'info';
			case 40: // WARN
				return 'warning';
			case 50: // ERROR
			case 60: // FATAL
				return 'error';
			default:
				return 'info';
		}
	}
}
