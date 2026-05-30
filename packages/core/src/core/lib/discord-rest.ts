// Discord REST client options factory.
//
// When `DISCORD_PROXY_URL` is set, every outbound REST call (from discord.js
// internals and from any standalone `new REST()` we construct) is routed
// through the shared proxy instead of `https://discord.com/api`. The proxy
// (nirn-proxy in our compose) holds the authoritative per-route + global
// bucket state for the whole fleet, so 1000s of stateless workers can't burn
// the global 50/s limit or trigger a CloudFlare ban.
//
// We *also* disable discord.js' built-in `globalRequestsPerSecond` limiter
// (set to `Infinity`) when the proxy is on — the proxy is now authoritative;
// double-throttling adds latency without buying safety. And we lower
// `invalidRequestWarningInterval` so we observe 401/403/429 trends before they
// become a ban.
import type { RESTOptions } from "@discordjs/rest";
import { getDiscordProxyUrl } from "#core/env.js";

export interface BuildRestOptions {
  /**
   * When true and a proxy URL is configured, the proxy is used. Default true.
   * The loadtest script flips this to false to A/B against a direct path.
   */
  enableProxy?: boolean;
  /** Override env lookup (mostly for tests). */
  proxyUrl?: string | null;
}

export function buildRestOptions(
  opts: BuildRestOptions = {},
): Partial<RESTOptions> {
  const enableProxy = opts.enableProxy ?? true;
  const proxyUrl =
    opts.proxyUrl !== undefined ? opts.proxyUrl : getDiscordProxyUrl();

  const base: Partial<RESTOptions> = {
    // Warn (and increment ember_rest_invalid_request_warning_total) every 500
    // 401/403/429s in a rolling 10-min window. Discord bans the bot's IP at
    // 10k in 10 min; 500 gives us 20× headroom to react.
    invalidRequestWarningInterval: 500,
  };

  if (!enableProxy || !proxyUrl) return base;

  return {
    ...base,
    api: `${proxyUrl}/api`,
    // The proxy is authoritative. Local pre-throttling here just adds latency
    // and double-counts against per-process knowledge of a shared bucket.
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
  };
}

/** Convenience: true iff `DISCORD_PROXY_URL` is configured. */
export const isRestProxyEnabled = (): boolean => getDiscordProxyUrl() !== null;
