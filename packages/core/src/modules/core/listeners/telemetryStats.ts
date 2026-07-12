import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  guildCount,
  rest429Total,
  restRetryAfterSeconds,
  restInvalidRequestWarnings,
  shardLatency,
  shardStatus,
} from "@lumi/observability";
import { isRestProxyEnabled } from "#lib/discord-rest.js";

const REFRESH_MS = 15_000;

@ApplyOptions<Listener.Options>({ once: true, event: Events.ClientReady })
export class TelemetryStatsListener extends Listener<
  typeof Events.ClientReady
> {
  public run() {
    const { client } = this.container;

    const labels = (info: { route: string; method: string; global: boolean }) =>
      ({
        route: info.route,
        method: info.method,
        global: String(info.global),
      }) as const;

    client.rest.on("rateLimited", (info) => {
      rest429Total.inc(labels(info));
      restRetryAfterSeconds.observe(labels(info), info.timeToReset / 1000);
    });

    client.rest.on("invalidRequestWarning", () => {
      restInvalidRequestWarnings.inc();
    });

    if (isRestProxyEnabled()) {
      this.container.logger.info(
        "[REST] Routing through DISCORD_PROXY_URL — local global throttle disabled",
      );
    }

    const refresh = () => {
      guildCount.set(client.guilds.cache.size);
      for (const [id, shard] of client.ws.shards) {
        const label = String(id);
        shardLatency.set({ shard: label }, shard.ping);
        shardStatus.set({ shard: label }, shard.status === 0 ? 1 : 0);
      }
    };

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    timer.unref();
  }
}
