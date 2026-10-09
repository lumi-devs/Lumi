import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import { withIdempotency } from "#lib/rpc/idempotency.js";
import { createMemoryValkey } from "../mocks/memory-valkey.js";

const GUILD_ID = "123456789012345678";
const TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withIdempotency", () => {
  let valkey: ReturnType<typeof createMemoryValkey>;

  beforeEach(() => {
    valkey = createMemoryValkey();
    (container as any).valkey = valkey;
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
    ).rejects.toMatchObject({ code: RpcFailureCodes.Conflict, retryable: true });

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

    expect(valkey.set).toHaveBeenCalledWith(
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

    expect(valkey.pexpire).toHaveBeenCalled();
    for (const call of valkey.pexpire.mock.calls) {
      expect(call[1]).toBe(20);
    }

    const callsAtCompletion = valkey.pexpire.mock.calls.length;
    await sleep(50);
    expect(valkey.pexpire.mock.calls.length).toBe(callsAtCompletion);
  });

  it("uses explicit idempotencyKey when provided instead of hashing input", async () => {
    const fn = vi.fn().mockResolvedValue({ status: "saved" });

    const first = await withIdempotency(
      "test.mutation",
      GUILD_ID,
      TIMEOUT_MS,
      { title: "Version 1" },
      fn,
      undefined,
      "custom-idem-uuid-1",
    );
    expect(first).toEqual({ status: "saved" });
    expect(fn).toHaveBeenCalledTimes(1);

    // Call again with DIFFERENT input but SAME idempotencyKey
    const second = await withIdempotency(
      "test.mutation",
      GUILD_ID,
      TIMEOUT_MS,
      { title: "Version 2 (modified)" },
      fn,
      undefined,
      "custom-idem-uuid-1",
    );
    expect(second).toEqual({ status: "saved" });
    // Handled via cached result; function not called again
    expect(fn).toHaveBeenCalledTimes(1);

    // Different idempotencyKey invokes the function again
    await withIdempotency(
      "test.mutation",
      GUILD_ID,
      TIMEOUT_MS,
      { title: "Version 3" },
      fn,
      undefined,
      "custom-idem-uuid-2",
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
