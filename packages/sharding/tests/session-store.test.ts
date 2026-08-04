import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RedisSessionStore } from "../src/session-store.js";
import type { SessionInfo } from "@discordjs/ws";

function sessionInfo(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    shardId: 0,
    shardCount: 1,
    sessionId: "session-1",
    sequence: 1,
    resumeURL: "wss://resume.example",
    ...overrides,
  };
}

describe("RedisSessionStore", () => {
  let mockRedis: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
      multi: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retrieve() does not fall back to stale/absent Redis data while a flush is in flight", async () => {
    // The pipeline's exec() is held open until we manually resolve it, so we
    // can observe retrieve() behavior in the window between `pending` being
    // cleared and the write actually landing in Redis.
    let resolveExec!: (v: unknown[]) => void;
    const execPromise = new Promise<unknown[]>((resolve) => {
      resolveExec = resolve;
    });
    const set = vi.fn();
    mockRedis.multi.mockReturnValue({
      set,
      del: vi.fn(),
      exec: vi.fn().mockReturnValue(execPromise),
    });
    // Simulate Redis not having committed the write yet: GET still returns
    // null (as it would before the pipeline resolves).
    mockRedis.get.mockResolvedValue(null);

    const store = new RedisSessionStore({
      redis: mockRedis,
      clusterName: "test",
      flushIntervalMs: 1_000_000, // effectively disable the timer for this test
    });

    const info = sessionInfo({ sessionId: "session-in-flight" });
    store.update(0, info);

    const flushPromise = store.flush();

    // At this point flush() has synchronously snapshotted-and-cleared
    // `pending` but the pipeline hasn't resolved yet. A concurrent
    // retrieve() for the same shard must not return stale/absent data.
    const retrieved = await store.retrieve(0);
    expect(retrieved).toEqual(info);
    // Confirms this assertion actually exercised the in-flight path, not a
    // leftover value still sitting in `pending`.
    expect(mockRedis.get).not.toHaveBeenCalled();

    resolveExec([]);
    await flushPromise;

    // Once the pipeline has landed, retrieve() reads through to Redis as
    // normal.
    mockRedis.get.mockResolvedValue(JSON.stringify(info));
    const afterFlush = await store.retrieve(0);
    expect(afterFlush).toEqual(info);

    await store.close();
  });

  it("restores an entry to `pending` if the flush pipeline rejects, without dropping a newer concurrent update", async () => {
    let rejectExec!: (err: Error) => void;
    const execPromise = new Promise((_resolve, reject) => {
      rejectExec = reject;
    });
    mockRedis.multi.mockReturnValue({
      set: vi.fn(),
      del: vi.fn(),
      exec: vi.fn().mockReturnValue(execPromise),
    });

    const store = new RedisSessionStore({
      redis: mockRedis,
      clusterName: "test",
      flushIntervalMs: 1_000_000,
    });

    const original = sessionInfo({ sessionId: "original" });
    store.update(1, original);
    const flushPromise = store.flush().catch(() => {});

    // A newer update lands for the same shard while the failing flush is
    // still in flight.
    const newer = sessionInfo({ sessionId: "newer" });
    store.update(1, newer);

    rejectExec(new Error("connection reset"));
    await flushPromise;

    // The newer update must win, not get clobbered by the failed flush's
    // restore-on-error path.
    expect(await store.retrieve(1)).toEqual(newer);

    await store.close();
  });
});
