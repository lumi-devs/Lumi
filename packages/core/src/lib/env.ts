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
    const n = Number(raw);
    if (!isNaN(n) && Number.isInteger(n)) return n;
    throw new Error(`[ENV] Invalid integer: ${key}=${raw}`);
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export const envIsDefined = (key: string) => Boolean(process.env[key]);

export type ServiceRole = "worker" | "gateway" | "consumer" | "scheduler";

export function getServiceRole(): ServiceRole {
  const raw = process.env["LUMI_ROLE"];
  if (
    raw === "gateway" ||
    raw === "consumer" ||
    raw === "worker" ||
    raw === "scheduler"
  )
    return raw;
  return "worker";
}

/** Roles that own the BullMQ Worker (consume jobs and fire tasks). */
export const roleOwnsScheduler = (r: ServiceRole) =>
  r === "scheduler" || r === "worker";

/** Roles that execute task effects (Discord-side work) on the bus. */
export const roleExecutesTaskEffects = (r: ServiceRole) =>
  r === "consumer" || r === "worker";

export function getConsumerId(): string {
  return (
    process.env["LUMI_CONSUMER_ID"] ??
    process.env["HOSTNAME"] ??
    `worker-${process.pid}`
  );
}

export const isInteractionDeferAtGateway = () =>
  process.env["INTERACTION_DEFER_AT_GATEWAY"] === "true";

/**
 * Whether to run the Redis entity-cache populator. The projection is
 * provisioned-ahead infra for a future `GuildManager: 0` step and currently has
 * zero read callers, so populating it is pure write overhead on every dispatch.
 * Default off; opt in only when actively building the cache-backed read path.
 */
export const isEntityCachePopulateEnabled = () =>
  process.env["ENTITY_CACHE_POPULATE"] === "true";

/**
 * Cluster name turns on the Redis-backed cluster coordinator (shard
 * range assignment + session resumption + shared IDENTIFY throttling).
 * Unset → single-replica path: SHARD_LIST honored, sessions not persisted.
 */
export const getClusterName = (): string | null =>
  process.env["CLUSTER_NAME"]?.trim() || null;

/**
 * Comma- or colon-separated list of absolute directory paths to add as extra
 * ModuleStore roots at startup — the Lumi equivalent of RedBot's `--cog-path`.
 *
 * Example: `LUMI_DEV_PATHS=/home/dev/my-modules:/home/dev/other-modules`
 *
 * Paths are non-persistent (env var only). Use for development and local testing;
 * never set in production. Modules in these directories are discovered and loaded
 * exactly like bundled modules — they just live outside the repo.
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
 * `http://nirn-proxy:8080` — `/api` is appended by `buildRestOptions()`.
 */
export const getDiscordProxyUrl = (): string | null => {
  const raw = process.env["DISCORD_PROXY_URL"]?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
};
