/** Extended by the augmentation in `src/core/types/common.ts`. */
export interface Env {}

export function envParseString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export function envParseInteger(key: string, defaultValue?: number): number {
  const raw = process.env[key];
  if (raw !== undefined) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && /^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    throw new Error(`[ENV] Invalid integer: ${key}=${raw}`);
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export const envIsDefined = (key: string) => Boolean(process.env[key]);

export function getConsumerId(): string {
  return (
    process.env["LUMI_CONSUMER_ID"] ??
    process.env["HOSTNAME"] ??
    `worker-${process.pid}`
  );
}

/**
 * Whether this process should own the pod's single HTTP surface (RPC,
 * metrics, `/healthz`/`/readyz`). A process not spawned by discord.js's
 * `ShardingManager` (a standalone dev run) is always primary. A
 * ShardingManager child is primary only if shard 0 is
 * among the ids it holds - only one process per pod may bind the shared
 * port, and shard 0 always exists.
 */
export function isPrimaryShard(): boolean {
  if (!process.env["SHARDING_MANAGER"]) return true;
  const raw = process.env["SHARDS"];
  if (!raw) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : [parsed];
    return ids.includes(0);
  } catch {
    return true;
  }
}

/**
 * Whether to run the Redis entity-cache populator. The projection is
 * provisioned-ahead infra for a future `GuildManager: 0` step and currently has
 * zero read callers, so populating it is pure write overhead on every dispatch.
 * Default off; opt in only when actively building the cache-backed read path.
 */
export const isEntityCachePopulateEnabled = () =>
  process.env["ENTITY_CACHE_POPULATE"] === "true";

/**
 * Cluster name namespaces the shard telemetry each replica publishes to
 * Redis for the dashboard's fleet view. Shard ownership itself is static,
 * set per replica via SHARD_LIST - this has no effect on assignment,
 * session resumption, or IDENTIFY throttling. Unset → telemetry reports
 * under the shared "default" namespace.
 */
export const getClusterName = (): string | null =>
  process.env["CLUSTER_NAME"]?.trim() || null;

/**
 * Comma- or colon-separated list of absolute directory paths to add as extra
 * ModuleStore roots at startup - the Lumi equivalent of RedBot's `--cog-path`.
 *
 * Example: `LUMI_DEV_PATHS=/home/dev/my-modules:/home/dev/other-modules`
 *
 * Paths are non-persistent (env var only). Use for development and local testing;
 * never set in production. Modules in these directories are discovered and loaded
 * exactly like bundled modules - they just live outside the repo.
 */
export function getDevModulePaths(): string[] {
  const raw = process.env["LUMI_DEV_PATHS"]?.trim();
  if (!raw) return [];
  return raw
    .split(/[,:]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Base URL of the shared outbound REST proxy (nirn-proxy or equivalent).
 * Unset / empty → discord.js talks to discord.com directly (safe for a single
 * worker; required to opt in once multiple workers share a bot token).
 * Trailing slashes are tolerated; pass the proxy root, e.g.
 * `http://nirn-proxy:8080` - `/api` is appended by `buildRestOptions()`.
 */
export const getDiscordProxyUrl = (): string | null => {
  const raw = process.env["DISCORD_PROXY_URL"]?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
};

/**
 * Public origin of the dashboard, e.g. `https://lumi.example.com`. Used only
 * to build the appeal link DMed on ban/timeout - unset means appeal links
 * are skipped rather than DMed as a broken/relative URL.
 */
export const getDashboardPublicUrl = (): string | null => {
  const raw = process.env["DASHBOARD_PUBLIC_URL"]?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
};
