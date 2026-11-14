import { describe } from "bun:test";
import Redis, { type RedisOptions as RedisOptions } from "ioredis";

const testDatabaseUrl = process.env.LUMI_TEST_DATABASE_URL;
const testRedisUrl = process.env.LUMI_TEST_REDIS_URL;

const hasIntegrationEnv = Boolean(testDatabaseUrl && testRedisUrl);

const SkipMessage =
  "[integration] Skipping - set LUMI_TEST_DATABASE_URL and LUMI_TEST_REDIS_URL " +
  "to a throwaway Postgres/Redis to run this suite (see agents/conventions/testing.md).";

if (!hasIntegrationEnv) {
  console.warn(SkipMessage);
}

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

function requireTestRedisUrl(): string {
  if (!testRedisUrl) throw new Error("LUMI_TEST_REDIS_URL is not set");
  return testRedisUrl;
}

export function createTestRedis(): Redis {
  return new Redis(requireTestRedisUrl(), { maxRetriesPerRequest: 2 });
}

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

export async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

export async function deleteByPrefix(redis: Redis, prefix: string): Promise<void> {
  const keys = await scanKeys(redis, `${prefix}*`);
  if (keys.length) await redis.del(...keys);
}
