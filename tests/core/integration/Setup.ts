import { describe } from "bun:test";
import Valkey, { type RedisOptions as ValkeyOptions } from "iovalkey";

export const testDatabaseUrl = process.env.LUMI_TEST_DATABASE_URL;
export const testValkeyUrl = process.env.LUMI_TEST_VALKEY_URL;

export const hasIntegrationEnv = Boolean(testDatabaseUrl && testValkeyUrl);

const SkipMessage =
  "[integration] Skipping - set LUMI_TEST_DATABASE_URL and LUMI_TEST_VALKEY_URL " +
  "to a throwaway Postgres/Valkey to run this suite (see agents/conventions/testing.md).";

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

export function requireTestValkeyUrl(): string {
  if (!testValkeyUrl) throw new Error("LUMI_TEST_VALKEY_URL is not set");
  return testValkeyUrl;
}

export function createTestValkey(): Valkey {
  return new Valkey(requireTestValkeyUrl(), { maxRetriesPerRequest: 2 });
}

export function parseTestValkeyOptions(): ValkeyOptions {
  const url = new URL(requireTestValkeyUrl());
  const opts: ValkeyOptions = {
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

export async function scanKeys(valkey: Valkey, pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await valkey.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

export async function deleteByPrefix(valkey: Valkey, prefix: string): Promise<void> {
  const keys = await scanKeys(valkey, `${prefix}*`);
  if (keys.length) await valkey.del(...keys);
}
