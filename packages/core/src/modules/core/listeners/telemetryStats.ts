import { Events, type Client } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import type { Container } from "@lumi/lib/services.js";
import {
  guildCount,
  rest429Total,
  restRetryAfterSeconds,
  restInvalidRequestWarnings,
  shardLatency,
  shardStatus,
} from "@lumi/observability";
import { getDiscordProxyUrl } from "@lumi/lib/env.js";

const RefreshMs = 15_000;

let boundClient: Client | undefined;
let rateLimitedHandler:
  | ((info: {
      route: string;
      method: string;
      global: boolean;
      timeToReset: number;
    }) => void)
  | undefined;
let invalidRequestHandler: (() => void) | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

export const telemetryStatsListener = defineListener({
  name: "telemetryStatsListener",
  event: Events.ClientReady,
  once: true,
  execute(services: Container) {
    const { client } = services;
    boundClient = client;

    const labels = (info: { route: string; method: string; global: boolean }) =>
      ({
        route: info.route,
        method: info.method,
        global: String(info.global),
      }) as const;

    rateLimitedHandler = (info) => {
      rest429Total.inc(labels(info));
      restRetryAfterSeconds.observe(labels(info), info.timeToReset / 1000);
    };
    client.rest.on("rateLimited", rateLimitedHandler);

    invalidRequestHandler = () => {
      restInvalidRequestWarnings.inc();
    };
    client.rest.on("invalidRequestWarning", invalidRequestHandler);

    if (getDiscordProxyUrl() !== null) {
      services.logger.info(
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
    refreshTimer = setInterval(refresh, RefreshMs);
    refreshTimer.unref();
  },
  onDetach() {
    if (boundClient) {
      if (rateLimitedHandler) boundClient.rest.off("rateLimited", rateLimitedHandler);
      if (invalidRequestHandler) {
        boundClient.rest.off("invalidRequestWarning", invalidRequestHandler);
      }
      boundClient = undefined;
    }
    if (refreshTimer) clearInterval(refreshTimer);
    rateLimitedHandler = undefined;
    invalidRequestHandler = undefined;
    refreshTimer = undefined;
  },
});
