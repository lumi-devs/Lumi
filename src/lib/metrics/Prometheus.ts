import { container } from '@sapphire/framework';
import { envParseBoolean, envParseInteger } from '@skyra/env-utilities';
import { createServer } from 'node:http';
import { register, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

export class PrometheusManager {
	private readonly _enabled = envParseBoolean('PROMETHEUS_ENABLED', false);
	private readonly _port = envParseInteger('PROMETHEUS_PORT', 9090);
	private readonly _server = createServer(async (req, res) => {
		if (req.url === '/metrics') {
			try {
				res.setHeader('Content-Type', register.contentType);
				res.end(await register.metrics());
			} catch (ex) {
				res.statusCode = 500;
				res.end(ex);
			}
		} else {
			res.statusCode = 404;
			res.end();
		}
	});

	public constructor() {
		if (this._enabled) {
			collectDefaultMetrics({ prefix: 'ember_' });
		}
	}

	public start() {
		if (!this._enabled) return;
		this._server.listen(this._port, () => {
			container.logger.info(`[Prometheus] Metrics server listening on port ${this._port}`);
		});
	}

	public stop() {
		if (!this._enabled) return;
		this._server.close();
	}
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export const commandCounter = new Counter({
	name: 'ember_commands_total',
	help: 'Total number of commands executed',
	labelNames: ['command', 'status']
});

export const commandDuration = new Histogram({
	name: 'ember_command_duration_seconds',
	help: 'Duration of command execution in seconds',
	labelNames: ['command'],
	buckets: [0.1, 0.5, 1, 2, 5]
});

export const messageCounter = new Counter({
	name: 'ember_messages_total',
	help: 'Total number of messages observed'
});
