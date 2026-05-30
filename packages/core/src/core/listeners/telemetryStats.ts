// Feeds the gateway/REST metrics gauges from the live client: shard latency &
// readiness, cached guild count, and a counter for Discord REST 429s. Runs once
// on ready, then refreshes the gauges on an interval.
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
import { isRestProxyEnabled } from "#core/lib/discord-rest.js";

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
      // info.timeToReset is in ms. Convert to seconds for the histogram.
      restRetryAfterSeconds.observe(labels(info), info.timeToReset / 1000);
    });

    // discord.js emits this every `invalidRequestWarningInterval` 401/403/429s
    // in a rolling 10-min window. Each emit = N invalid requests; the counter is
    // unitless emit-count (alerts compute rate). Discord IP-bans the bot at
    // 10k invalid/10min — `info.remainingTime` is the time to the window reset.
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
