import '#lib/setup.js';

import { container } from '@sapphire/framework';
import { envIsDefined, envParseBoolean, envParseString } from '@skyra/env-utilities';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { EmberClient } from './EmberClient.js';

if (envParseBoolean('SENTRY_ENABLED', false) && envIsDefined('SENTRY_DSN')) {
	Sentry.init({
		dsn: envParseString('SENTRY_DSN'),
		integrations: [
			Sentry.consoleIntegration(),
			Sentry.functionToStringIntegration(),
			Sentry.linkedErrorsIntegration(),
			Sentry.onUncaughtExceptionIntegration(),
			Sentry.onUnhandledRejectionIntegration(),
			Sentry.httpIntegration({ breadcrumbs: true }),
			Sentry.prismaIntegration(),
			nodeProfilingIntegration()
		],
		environment: envParseString('NODE_ENV'),
		tracesSampleRate: 1.0,
		profilesSampleRate: 1.0,
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
