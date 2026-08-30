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

/**
 * Fails fast on every missing key at once, instead of the first caller of
 * `envParseString`/`envParseInteger` for that key surfacing it mid-request.
 */
export function validateRequiredEnv(keys: readonly string[]): void {
  const missing = keys.filter((key) => process.env[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `[ENV] Missing required environment variable(s): ${missing.join(", ")}`,
    );
  }
}

/**
 * How many shards this deployment runs, from the env `ShardingManager` injects.
 * Readable at module scope, before the discord.js client exists.
 */
export function getShardCount(): number {
  const raw = process.env["SHARD_COUNT"];
  const n = raw === undefined ? Number.NaN : Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);

  const list = process.env["SHARDS"];
  if (list) {
    try {
      const parsed: unknown = JSON.parse(list);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.length;
    } catch {
      // fall through
    }
  }
  return 1;
}

/**
 * Per-process Postgres pool size.
 *
 * A fixed per-process pool multiplies by shard count, so a deployment that
 * scales out silently walks into Postgres' `max_connections`: at the old flat
 * 10, forty shards alone exhausted a default server. Divide a fleet-wide budget
 * instead, so total connections stay flat as shards are added.
 *
 * `POSTGRES_POOL_MAX` still wins when set, for deployments fronted by a pooler
 * where per-process sizing is the operator's call.
 */
export function resolvePgPoolSize(): number {
  const explicit = Number(process.env["POSTGRES_POOL_MAX"]);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const budget = Number(process.env["POSTGRES_POOL_TOTAL"]);
  const total = Number.isFinite(budget) && budget > 0 ? budget : 80;

  return Math.max(2, Math.floor(total / getShardCount()));
}

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
  const raw = (
    process.env["DISCORD_PROXY_URL"] ||
    process.env["DISCORD_REST_PROXY_URL"] ||
    process.env["REST_PROXY_URL"]
  )?.trim();
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
