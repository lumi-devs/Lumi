import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { envParseBoolean } from '@skyra/env-utilities';
import { messageCounter } from '#lib/metrics/Prometheus.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class MessageMetricsListener extends Listener<typeof Events.MessageCreate> {
	public run() {
		if (envParseBoolean('PROMETHEUS_ENABLED', false)) {
			messageCounter.inc();
		}
	}
}
