import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import { withIdempotency } from "#lib/rpc/idempotency.js";
import { createMemoryRedis } from "../mocks/memory-redis.js";

const GUILD_ID = "123456789012345678";
const TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withIdempotency", () => {
  let redis: ReturnType<typeof createMemoryRedis>;

  beforeEach(() => {
    redis = createMemoryRedis();
    (container as any).redis = redis;
  });

  it("runs the handler once and returns its result", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, value: 1 });

    const result = await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, value: 1 });
  });

  it("replays the cached result for an identical call after completion, without re-running the handler", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, value: 1 });

    const first = await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn);
    const second = await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("rejects a duplicate call made while the first is still in flight", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const fn = vi.fn().mockImplementation(async () => {
      await gate;
      return { ok: true };
    });

    const firstCall = withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn);
    await Promise.resolve();
    await Promise.resolve();

    await expect(
      withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn),
    ).rejects.toThrow(CodedRpcError);
    await expect(
      withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn),
    ).rejects.toMatchObject({ code: RpcFailureCodes.Conflict });

    releaseFirst();
    await firstCall;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure, so a retry after an error re-runs the handler", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true });

    await expect(
      withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn),
    ).rejects.toThrow("boom");

    const result = await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it("treats different input as a different idempotency key", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });

    await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { backupId: 1 }, fn);
    await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { backupId: 2 }, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("treats different guilds as different idempotency keys even with the same input", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });

    await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1 }, fn);
    await withIdempotency("test.action", "987654321098765432", TIMEOUT_MS, { a: 1 }, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("hashes input regardless of key order", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });

    await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { a: 1, b: 2 }, fn);
    await withIdempotency("test.action", GUILD_ID, TIMEOUT_MS, { b: 2, a: 1 }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("derives the pending lock's TTL from the action's own timeout plus the margin, not a flat constant", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });

    await withIdempotency("test.action", GUILD_ID, 5_000, { a: 1 }, fn, 2_000);

    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "PX",
      7_000,
      "NX",
    );
  });

  it("re-arms the pending lock while a handler outruns its declared timeout, and stops once it finishes", async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 60)),
    );

    await withIdempotency("test.action", GUILD_ID, 10, { a: 1 }, fn, 10);

    expect(redis.pexpire).toHaveBeenCalled();
    for (const call of redis.pexpire.mock.calls) {
      expect(call[1]).toBe(20);
    }

    const callsAtCompletion = redis.pexpire.mock.calls.length;
    await sleep(50);
    expect(redis.pexpire.mock.calls.length).toBe(callsAtCompletion);
  });
});
