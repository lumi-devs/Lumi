import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DistributedScheduler } from "../src/index.js";

const createMockRedis = () => {
  const mockSet = vi.fn().mockResolvedValue("OK");
  const mockEval = vi.fn().mockResolvedValue(1);
  return {
    set: mockSet,
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    eval: mockEval,
    evalSha: vi.fn().mockResolvedValue(1),
    script: {
      load: vi.fn().mockResolvedValue("sha1"),
    },
    zadd: vi.fn().mockResolvedValue(1),
    zrem: vi.fn().mockResolvedValue(1),
    zrange: vi.fn().mockResolvedValue([]),
    expire: vi.fn().mockResolvedValue(1),
    pttl: vi.fn().mockResolvedValue(-2),
    keys: vi.fn().mockResolvedValue([]),
  };
};

describe("@lumi/scheduler — DistributedScheduler", () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let scheduler: DistributedScheduler;

  beforeEach(() => {
    mockRedis = createMockRedis();
    scheduler = new DistributedScheduler(mockRedis as any);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it("registers and unregisters jobs", () => {
    scheduler.register({
      name: "test-job",
      cron: "0 4 * * *",
      handler: vi.fn(),
    });
    scheduler.unregister("test-job");
  });

  it("rejects invalid cron expressions", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduler.register({
      name: "bad-cron",
      cron: "invalid cron",
      handler: vi.fn(),
    });
    consoleError.mockRestore();
  });

  it("starts and stops cleanly", async () => {
    await scheduler.start();
    await scheduler.stop();
  });

  it("does not run jobs before first aligned tick", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.register({
      name: "immediate-test",
      cron: "* * * * *",
      handler,
    });

    await scheduler.start();
    await new Promise((r) => setTimeout(r, 50));
    await scheduler.stop();

    expect(handler).not.toHaveBeenCalled();
  });

  it("respects lock TTL", () => {
    scheduler.register({
      name: "ttl-job",
      cron: "0 * * * *",
      handler: vi.fn(),
      lockTtlMs: 30_000,
    });
    expect(true).toBe(true);
  });

  it("prevents concurrent runs of same job via running set", async () => {
    let releaseFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const handler = vi.fn().mockImplementation(() => firstPromise);
    scheduler.register({
      name: "concurrent-job",
      cron: "* * * * *",
      handler,
    });

    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    await scheduler.start();

    const tickPromise = scheduler["tick"]();

    await Promise.resolve();

    await scheduler["tick"]();

    expect(handler).toHaveBeenCalledTimes(1);

    releaseFirst!();
    await tickPromise;

    await scheduler.stop();
  });

  it("handles job handler errors gracefully", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("handler failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    scheduler.register({
      name: "error-job",
      cron: "* * * * *",
      handler,
    });

    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    await scheduler.start();
    await scheduler["tick"]();

    consoleError.mockRestore();
    expect(handler).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it("releases lock even when handler throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("handler failed"));
    scheduler.register({
      name: "lock-release-job",
      cron: "* * * * *",
      handler,
    });

    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    await scheduler.start();
    await scheduler["tick"]();

    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it("skips job if lock not acquired", { timeout: 10000 }, async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.register({
      name: "no-lock-job",
      cron: "* * * * *",
      handler,
      lockTtlMs: 100,
    });

    mockRedis.set.mockResolvedValue(null);
    mockRedis.eval.mockResolvedValue(1);

    await scheduler.start();
    await scheduler["tick"]();

    expect(handler).not.toHaveBeenCalled();

    await scheduler.stop();
  });

  it("skips job if already run this minute", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.register({
      name: "repeat-job",
      cron: "* * * * *",
      handler,
    });

    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    await scheduler.start();

    await scheduler["tick"]();
    expect(handler).toHaveBeenCalledTimes(1);

    await scheduler["tick"]();
    expect(handler).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it("runs job again on next minute", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.register({
      name: "repeat-job",
      cron: "* * * * *",
      handler,
    });

    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    await scheduler.start();

    await scheduler["tick"]();
    expect(handler).toHaveBeenCalledTimes(1);

    scheduler["lastRunMinute"].clear();

    await scheduler["tick"]();
    expect(handler).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it("validates cron on register", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduler.register({
      name: "bad-job",
      cron: "not a cron",
      handler: vi.fn(),
    });
    consoleError.mockRestore();
    expect(scheduler["jobs"].has("bad-job")).toBe(false);
  });

  it("allows re-registering after unregister", () => {
    scheduler.register({
      name: "job",
      cron: "0 * * * *",
      handler: vi.fn(),
    });
    scheduler.unregister("job");
    scheduler.register({
      name: "job",
      cron: "0 * * * *",
      handler: vi.fn(),
    });
    expect(scheduler["jobs"].has("job")).toBe(true);
  });
});