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
import { getDiscordProxyUrl } from "#lib/env.js";

const RefreshMs = 15_000;

@ApplyOptions<Listener.Options>({ once: true, event: Events.ClientReady })
export class TelemetryStatsListener extends Listener<
  typeof Events.ClientReady
> {
  #rateLimitedHandler?: (info: {
    route: string;
    method: string;
    global: boolean;
    timeToReset: number;
  }) => void;
  #invalidRequestHandler?: () => void;
  #refreshTimer?: ReturnType<typeof setInterval>;

  public run() {
    const { client } = this.container;

    const labels = (info: { route: string; method: string; global: boolean }) =>
      ({
        route: info.route,
        method: info.method,
        global: String(info.global),
      }) as const;

    this.#rateLimitedHandler = (info) => {
      rest429Total.inc(labels(info));
      restRetryAfterSeconds.observe(labels(info), info.timeToReset / 1000);
    };
    client.rest.on("rateLimited", this.#rateLimitedHandler);

    this.#invalidRequestHandler = () => {
      restInvalidRequestWarnings.inc();
    };
    client.rest.on("invalidRequestWarning", this.#invalidRequestHandler);

    if (getDiscordProxyUrl() !== null) {
      this.container.logger.info(
        "[REST] Routing through DISCORD_PROXY_URL - local global throttle disabled",
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
    this.#refreshTimer = setInterval(refresh, RefreshMs);
    this.#refreshTimer.unref();
  }

  public override onUnload() {
    const { client } = this.container;

    if (this.#rateLimitedHandler) {
      client.rest.off("rateLimited", this.#rateLimitedHandler);
    }
    if (this.#invalidRequestHandler) {
      client.rest.off("invalidRequestWarning", this.#invalidRequestHandler);
    }
    if (this.#refreshTimer) {
      clearInterval(this.#refreshTimer);
    }

    return super.onUnload();
  }
}
