import { describe } from "bun:test";
import Valkey, { type RedisOptions } from "iovalkey";

/**
 * Real-service integration suite guard.
 *
 * Deliberately reads `LUMI_TEST_DATABASE_URL` / `LUMI_TEST_REDIS_URL` rather
 * than the app's own `DATABASE_URL`/`REDIS_URL`/`POSTGRES_URL` names, so a
 * developer's `.env` (pointed at their real dev/prod database) can never be
 * picked up here by accident - these tests only run when a value is
 * deliberately supplied under these dedicated names.
 */
export const testDatabaseUrl = process.env.LUMI_TEST_DATABASE_URL;
export const testRedisUrl = process.env.LUMI_TEST_REDIS_URL;

export const hasIntegrationEnv = Boolean(testDatabaseUrl && testRedisUrl);

const SkipMessage =
  "[integration] Skipping - set LUMI_TEST_DATABASE_URL and LUMI_TEST_REDIS_URL " +
  "to a throwaway Postgres/Redis to run this suite (see agents/conventions/testing.md).";

if (!hasIntegrationEnv) {
  console.warn(SkipMessage);
}

/** `describe` that runs for real when both env vars are set, skips (with one clear reason in the test name) otherwise. */
export function integrationDescribe(name: string, fn: () => void): void {
  if (hasIntegrationEnv) {
    describe(name, fn);
  } else {
    describe.skip(`${name} - ${SkipMessage}`, fn);
  }
}

export function requireTestDatabaseUrl(): string {
  if (!testDatabaseUrl) throw new Error("LUMI_TEST_DATABASE_URL is not set");
  return testDatabaseUrl;
}

export function requireTestRedisUrl(): string {
  if (!testRedisUrl) throw new Error("LUMI_TEST_REDIS_URL is not set");
  return testRedisUrl;
}

/** Dedicated iovalkey connection to the throwaway test Redis (its own DB index, per the connection URL). */
export function createTestRedis(): Valkey {
  return new Valkey(requireTestRedisUrl(), { maxRetriesPerRequest: 2 });
}

/** `RedisOptions` form of the same URL, for APIs (e.g. `createEventBus`) that take options rather than a client. */
export function parseTestRedisOptions(): RedisOptions {
  const url = new URL(requireTestRedisUrl());
  const opts: RedisOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
  };
  if (url.password) opts.password = url.password;
  if (url.pathname.length > 1) {
    const db = Number(url.pathname.slice(1));
    if (!Number.isNaN(db)) opts.db = db;
  }
  return opts;
}

/**
 * Keys matching `pattern` via SCAN (never KEYS/FLUSHALL/FLUSHDB) - safe to run
 * against a shared test Redis DB since it only ever touches keys this suite
 * itself could have written.
 */
export async function scanKeys(redis: Valkey, pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

/** Deletes every key under `prefix` (see `scanKeys`). */
export async function deleteByPrefix(redis: Valkey, prefix: string): Promise<void> {
  const keys = await scanKeys(redis, `${prefix}*`);
  if (keys.length) await redis.del(...keys);
}
