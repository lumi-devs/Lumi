import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { getShardCount, resolvePgPoolSize } from "#lib/Env.js";

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

  it("defaults to a flat pool size", () => {
    delete process.env["POSTGRES_POOL_MAX"];
    delete process.env["POSTGRES_POOL_TOTAL"];
    expect(resolvePgPoolSize()).toBe(20);
  });

  it("lets an explicit POSTGRES_POOL_MAX win, for pooler-fronted deploys", () => {
    process.env["POSTGRES_POOL_MAX"] = "25";
    process.env["SHARD_COUNT"] = "40";
    expect(resolvePgPoolSize()).toBe(25);
  });
});
