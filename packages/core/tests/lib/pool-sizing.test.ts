import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getShardCount, resolvePgPoolSize } from "../../src/lib/env.js";

const KEYS = ["SHARD_COUNT", "SHARDS", "POSTGRES_POOL_MAX", "POSTGRES_POOL_TOTAL"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("getShardCount", () => {
  it("defaults to 1 when unsharded", () => {
    expect(getShardCount()).toBe(1);
  });

  it("reads SHARD_COUNT", () => {
    process.env["SHARD_COUNT"] = "24";
    expect(getShardCount()).toBe(24);
  });

  it("falls back to the length of the SHARDS list", () => {
    process.env["SHARDS"] = "[0,1,2,3]";
    expect(getShardCount()).toBe(4);
  });

  it("ignores malformed values rather than propagating NaN", () => {
    process.env["SHARD_COUNT"] = "not-a-number";
    process.env["SHARDS"] = "{{{";
    expect(getShardCount()).toBe(1);
  });
});

describe("resolvePgPoolSize", () => {
  // A flat per-process pool multiplies by shard count, which is how a growing
  // deployment silently exhausts Postgres' max_connections.
  it("keeps total fleet connections flat as shards grow", () => {
    process.env["POSTGRES_POOL_TOTAL"] = "80";

    process.env["SHARD_COUNT"] = "1";
    const one = resolvePgPoolSize();
    process.env["SHARD_COUNT"] = "40";
    const forty = resolvePgPoolSize();

    expect(one).toBe(80);
    expect(forty).toBe(2);
    expect(forty * 40).toBeLessThanOrEqual(one * 1 + 80);
  });

  it("never drops below a usable floor", () => {
    process.env["POSTGRES_POOL_TOTAL"] = "10";
    process.env["SHARD_COUNT"] = "1000";
    expect(resolvePgPoolSize()).toBe(2);
  });

  it("lets an explicit POSTGRES_POOL_MAX win, for pooler-fronted deploys", () => {
    process.env["POSTGRES_POOL_MAX"] = "25";
    process.env["SHARD_COUNT"] = "40";
    expect(resolvePgPoolSize()).toBe(25);
  });
});
