import './client/setup.js';

import { container } from '@sapphire/framework';
import { envIsDefined, envParseString } from '#lib/env.js';
import * as Sentry from '@sentry/node';
import { EmberClient } from './client/EmberClient.js';

if (envParseString('SENTRY_ENABLED', 'false') === 'true' && envIsDefined('SENTRY_DSN')) {
	Sentry.init({
		dsn: envParseString('SENTRY_DSN'),
		integrations: [
			Sentry.consoleIntegration(),
			Sentry.functionToStringIntegration(),
			Sentry.linkedErrorsIntegration(),
			Sentry.onUncaughtExceptionIntegration(),
			Sentry.onUnhandledRejectionIntegration(),
			Sentry.httpIntegration({ breadcrumbs: true }),
			Sentry.prismaIntegration()
		],
		environment: envParseString('NODE_ENV'),
		tracesSampleRate: 1.0,
		sendDefaultPii: true
	});
}

const client = new EmberClient();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, async () => {
		container.logger.info(`[Shutdown] Received ${signal}`);
		await client.destroy().catch((err) => container.logger.error('[Shutdown] destroy failed:', err));
		process.exit(0);
	});
}

try {
	await client.login(envParseString('BOT_TOKEN'));
	container.logger.info('[Startup] Ember is online');
} catch (err) {
	container.logger.fatal('[Startup] Fatal error:', err);
	await client.destroy().catch(() => undefined);
	process.exit(1);
}
