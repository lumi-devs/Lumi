import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import { envParseString } from '#lib/env.js';

@ApplyOptions<Listener.Options>({ event: Events.Debug })
export class SentryBreadcrumbListener extends Listener<typeof Events.Debug> {
	public run(message: string) {
		if (envParseString('SENTRY_ENABLED', 'false') !== 'true') return;

		Sentry.addBreadcrumb({
			category: 'console',
			message,
			level: 'debug',
			type: 'debug'
		});
	}
}
