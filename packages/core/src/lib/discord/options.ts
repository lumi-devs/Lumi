import type { RESTOptions } from "@discordjs/rest";
import { envParseInteger, getDiscordProxyUrl } from "#lib/env.js";

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
    opts.proxyUrl === undefined ? getDiscordProxyUrl() : opts.proxyUrl;

  const base: Partial<RESTOptions> = {
    invalidRequestWarningInterval: 500,
    timeout: envParseInteger("DISCORD_REST_TIMEOUT_MS", 15_000),
    retries: envParseInteger("DISCORD_REST_RETRIES", 3),
  };

  if (!enableProxy || !proxyUrl) return base;

  const cleanUrl = proxyUrl.replace(/\/api(\/v\d+)?\/?$/, "").replace(/\/+$/, "");

  return {
    ...base,
    api: `${cleanUrl}/api`,
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
  };
}
