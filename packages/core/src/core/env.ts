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
    if (!isNaN(n)) return n;
    throw new Error(`[ENV] Invalid: ${key}=${raw}`);
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export const envIsDefined = (key: string) => Boolean(process.env[key]);

export type EmberRole = "monolith" | "gateway" | "worker" | "scheduler";

export function getEmberRole(): EmberRole {
  const raw = process.env["EMBER_ROLE"];
  if (
    raw === "gateway" ||
    raw === "worker" ||
    raw === "monolith" ||
    raw === "scheduler"
  )
    return raw;
  return "monolith";
}

/** Roles that own the BullMQ Worker (consume jobs and fire tasks). */
export const roleOwnsScheduler = (r: EmberRole) =>
  r === "scheduler" || r === "monolith";

/** Roles that execute task effects (Discord-side work) on the bus. */
export const roleExecutesTaskEffects = (r: EmberRole) =>
  r === "worker" || r === "monolith";

export function getConsumerId(): string {
  return (
    process.env["EMBER_CONSUMER_ID"] ??
    process.env["HOSTNAME"] ??
    `worker-${process.pid}`
  );
}

export const isInteractionDeferAtGateway = () =>
  process.env["INTERACTION_DEFER_AT_GATEWAY"] === "true";

/**
 * Cluster name turns on the Redis-backed cluster coordinator (shard
 * range assignment + session resumption + shared IDENTIFY throttling).
 * Unset → single-replica path: SHARD_LIST honored, sessions not persisted.
 */
export const getClusterName = (): string | null =>
  process.env["CLUSTER_NAME"]?.trim() || null;

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
