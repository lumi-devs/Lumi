import { describe, it, expect } from "bun:test";
import {
  getSystemStatus,
  StatusThresholds,
  type SystemStatusDeps,
} from "@lumi/lib/rpc/system-status.js";

function baseDeps(overrides: Partial<SystemStatusDeps> = {}): SystemStatusDeps {
  return {
    now: () => Date.UTC(2026, 0, 1),
    probeTimeoutMs: 50,
    uptimeSec: () => 3_600,
    eventLoopLagP99Ms: () => 5,
    probePostgresLatencyMs: async () => 10,
    pingValkey: async () => "PONG",
    readSchedulerHeartbeat: async () => ({ holder: "scheduler-a", ageMs: 1_000 }),
    readSchedulerQueueCounts: async () => ({
      waiting: 0,
      active: 0,
      failed: 0,
      delayed: 0,
    }),
    readShardsSnapshot: async () => ({ total: 3, up: 3, stale: 0, worstLagMs: 8 }),
    readEventBusStats: async () => ({ lag: null, pending: 0 }),
    ...overrides,
  };
}

describe("getSystemStatus", () => {
  it("reports ok across the board when every probe is healthy", async () => {
    const result = await getSystemStatus(baseDeps());

    expect(result.observedAt).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
    expect(result.status).toBe("ok");
    expect(result.components.api).toMatchObject({ status: "ok", uptimeSec: 3_600 });
    expect(result.components.postgres).toMatchObject({ status: "ok", latencyMs: 10 });
    expect(result.components.valkey).toMatchObject({ status: "ok" });
    expect(result.components.scheduler).toMatchObject({
      status: "ok",
      lockHolder: "scheduler-a",
      heartbeatAgeMs: 1_000,
    });
    expect(result.components.shards).toMatchObject({ status: "ok", up: 3, total: 3 });
    expect(result.components.eventBus).toMatchObject({ status: "ok", pending: 0 });
  });

  it("marks postgres degraded (not down) on a slow but successful probe", async () => {
    const result = await getSystemStatus(
      baseDeps({ probePostgresLatencyMs: async () => StatusThresholds.postgresSlowMs + 1 }),
    );

    expect(result.components.postgres.status).toBe("degraded");
    expect(result.components.postgres.reason).toMatch(/slow query/);
    expect(result.status).toBe("degraded");
  });

  it("marks postgres down when the probe throws", async () => {
    const result = await getSystemStatus(
      baseDeps({
        probePostgresLatencyMs: async () => {
          throw new Error("connection refused");
        },
      }),
    );

    expect(result.components.postgres).toMatchObject({
      status: "down",
      reason: "connection refused",
      latencyMs: null,
    });
    expect(result.status).toBe("down");
  });

  it("marks postgres down when the probe exceeds the timeout", async () => {
    const result = await getSystemStatus(
      baseDeps({
        probeTimeoutMs: 10,
        probePostgresLatencyMs: () => new Promise((resolve) => setTimeout(() => resolve(1), 500)),
      }),
    );

    expect(result.components.postgres.status).toBe("down");
    expect(result.components.postgres.reason).toMatch(/timed out after 10ms/);
  });

  it("marks valkey down on a bad PING reply even if it resolves", async () => {
    const result = await getSystemStatus(
      baseDeps({ pingValkey: async () => "WRONG" }),
    );

    expect(result.components.valkey).toMatchObject({ status: "down" });
    expect(result.components.valkey.reason).toMatch(/unexpected reply/);
  });

  it("marks the scheduler down when no heartbeat has ever been observed", async () => {
    const result = await getSystemStatus(baseDeps({ readSchedulerHeartbeat: async () => null }));

    expect(result.components.scheduler).toMatchObject({
      status: "down",
      lockHolder: null,
      heartbeatAgeMs: null,
    });
  });

  it("marks the scheduler down once its heartbeat is stale", async () => {
    const result = await getSystemStatus(
      baseDeps({
        readSchedulerHeartbeat: async () => ({
          holder: "scheduler-a",
          ageMs: StatusThresholds.schedulerHeartbeatStaleMs + 1,
        }),
      }),
    );

    expect(result.components.scheduler.status).toBe("down");
    expect(result.components.scheduler.reason).toMatch(/stale/);
  });

  it("marks the scheduler degraded on failed jobs, even with a fresh heartbeat", async () => {
    const result = await getSystemStatus(
      baseDeps({
        readSchedulerQueueCounts: async () => ({
          waiting: 0,
          active: 1,
          failed: StatusThresholds.schedulerFailedJobsDegraded,
          delayed: 0,
        }),
      }),
    );

    expect(result.components.scheduler.status).toBe("degraded");
    expect(result.components.scheduler.reason).toMatch(/failed job/);
  });

  it("marks the scheduler degraded on a large backlog", async () => {
    const result = await getSystemStatus(
      baseDeps({
        readSchedulerQueueCounts: async () => ({
          waiting: StatusThresholds.schedulerBacklogDegraded,
          active: 0,
          failed: 0,
          delayed: 0,
        }),
      }),
    );

    expect(result.components.scheduler.status).toBe("degraded");
    expect(result.components.scheduler.reason).toMatch(/backlog/);
  });

  it("degrades the scheduler (not down) when only the queue-depth probe fails", async () => {
    const result = await getSystemStatus(
      baseDeps({
        readSchedulerQueueCounts: async () => {
          throw new Error("queue unreachable");
        },
      }),
    );

    expect(result.components.scheduler).toMatchObject({ status: "degraded", queue: null });
    expect(result.components.scheduler.reason).toMatch(/queue depth unavailable/);
  });

  it("treats zero expected shards as ok (single-process / no telemetry yet)", async () => {
    const result = await getSystemStatus(
      baseDeps({ readShardsSnapshot: async () => ({ total: 0, up: 0, stale: 0, worstLagMs: null }) }),
    );

    expect(result.components.shards).toMatchObject({ status: "ok", total: 0 });
  });

  it("marks shards down when none are up", async () => {
    const result = await getSystemStatus(
      baseDeps({ readShardsSnapshot: async () => ({ total: 3, up: 0, stale: 3, worstLagMs: null }) }),
    );

    expect(result.components.shards.status).toBe("down");
    expect(result.status).toBe("down");
  });

  it("marks shards degraded when some are up and some are stale/missing", async () => {
    const result = await getSystemStatus(
      baseDeps({ readShardsSnapshot: async () => ({ total: 3, up: 2, stale: 1, worstLagMs: 4 }) }),
    );

    expect(result.components.shards.status).toBe("degraded");
    expect(result.components.shards.reason).toMatch(/2\/3 shards up/);
  });

  it("marks shards down on a timed-out telemetry read", async () => {
    const result = await getSystemStatus(
      baseDeps({
        probeTimeoutMs: 10,
        readShardsSnapshot: () => new Promise((resolve) => setTimeout(resolve, 500)) as never,
      }),
    );

    expect(result.components.shards.status).toBe("down");
    expect(result.components.shards.reason).toMatch(/timed out/);
  });

  it("degrades api on high event-loop lag without affecting other components", async () => {
    const result = await getSystemStatus(
      baseDeps({ eventLoopLagP99Ms: () => StatusThresholds.apiEventLoopLagDegradedMs + 1 }),
    );

    expect(result.components.api.status).toBe("degraded");
    expect(result.components.postgres.status).toBe("ok");
  });

  it("degrades the event bus once pending entries cross the threshold", async () => {
    const result = await getSystemStatus(
      baseDeps({
        readEventBusStats: async () => ({
          lag: null,
          pending: StatusThresholds.eventBusPendingDegraded,
        }),
      }),
    );

    expect(result.components.eventBus.status).toBe("degraded");
  });

  it("leaves the event bus ok when no stream has been sampled (pending null)", async () => {
    const result = await getSystemStatus(
      baseDeps({ readEventBusStats: async () => ({ lag: null, pending: null }) }),
    );

    expect(result.components.eventBus).toMatchObject({ status: "ok", pending: null });
  });

  it("rolls the overall status up to the worst component (down beats degraded beats ok)", async () => {
    const result = await getSystemStatus(
      baseDeps({
        probePostgresLatencyMs: async () => StatusThresholds.postgresSlowMs + 1,
        readSchedulerHeartbeat: async () => null,
      }),
    );

    expect(result.components.postgres.status).toBe("degraded");
    expect(result.components.scheduler.status).toBe("down");
    expect(result.status).toBe("down");
  });
});
