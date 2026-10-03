import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";
import { container } from "@sapphire/framework";
import type { Redis } from "ioredis";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import { withIdempotency } from "#lib/rpc/idempotency.js";
import { RedisTTL } from "#lib/database/redis.js";
import { createTestRedis, deleteByPrefix, integrationDescribe, scanKeys } from "./setup.js";

const KeyPrefix = "lumi:rpc:idem:";

function uniqueGuildId(): string {
  return `int${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

integrationDescribe("withIdempotency (real Redis)", () => {
  let redis: Redis;

  beforeAll(() => {
    redis = createTestRedis();
    (container as unknown as { redis: Redis }).redis = redis;
  });

  afterEach(async () => {
    await deleteByPrefix(redis, KeyPrefix);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("first call wins the SET NX lock and runs fn exactly once", async () => {
    const guildId = uniqueGuildId();
    let calls = 0;
    const result = await withIdempotency("test.action", guildId, 1000, { a: 1 }, async () => {
      calls++;
      return { ok: true };
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(1);
  });

  it("a concurrent duplicate call throws Conflict while the first is still pending", async () => {
    const guildId = uniqueGuildId();
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withIdempotency("test.action", guildId, 1000, { a: 1 }, async () => {
      await firstGate;
      return "first";
    });

    // Give the first call's SET NX time to land before the duplicate races it.
    await Bun.sleep(20);

    const duplicate = withIdempotency("test.action", guildId, 1000, { a: 1 }, async () => "second");

    await expect(duplicate).rejects.toThrow(CodedRpcError);
    await expect(duplicate.catch((err: CodedRpcError) => err.code)).resolves.toBe(
      RpcFailureCodes.Conflict,
    );

    releaseFirst();
    expect(await first).toBe("first");
  });

  it("a replay after completion returns the cached result instead of re-running fn", async () => {
    const guildId = uniqueGuildId();
    let calls = 0;
    const fn = async () => {
      calls++;
      return { call: calls };
    };

    const first = await withIdempotency("test.action", guildId, 1000, { a: 1 }, fn);
    const replay = await withIdempotency("test.action", guildId, 1000, { a: 1 }, fn);

    expect(first).toEqual({ call: 1 });
    expect(replay).toEqual({ call: 1 });
    expect(calls).toBe(1);
  });

  it("a different input for the same action/guild is not deduped against the first", async () => {
    const guildId = uniqueGuildId();
    const a = await withIdempotency("test.action", guildId, 1000, { a: 1 }, async () => "a");
    const b = await withIdempotency("test.action", guildId, 1000, { a: 2 }, async () => "b");
    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("sets a TTL on the cached success record matching the configured done-TTL", async () => {
    const guildId = uniqueGuildId();
    await withIdempotency("test.action", guildId, 1000, { a: 1 }, async () => "ok");

    const keys = await scanKeys(redis, `lumi:rpc:idem:test.action:${guildId}:*`);
    expect(keys.length).toBe(1);

    const pttl = await redis.pttl(keys[0]!);
    const expectedMs = RedisTTL.rpcIdempotencyDone * 1000;
    expect(pttl).toBeGreaterThan(0);
    expect(pttl).toBeLessThanOrEqual(expectedMs);
    expect(pttl).toBeGreaterThan(expectedMs - 5000);
  });
});
