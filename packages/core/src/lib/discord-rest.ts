import type { RESTOptions } from "@discordjs/rest";
import { getDiscordProxyUrl } from "#lib/env.js";

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
  };

  if (!enableProxy || !proxyUrl) return base;

  return {
    ...base,
    api: `${proxyUrl}/api`,
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
  };
}
