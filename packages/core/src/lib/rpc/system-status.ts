import { TimeoutError, withTimeout } from "@lumi/lib/utilities/resilience.js";

/**
 * Aggregates every backing dependency `system.status.get` reports on into one
 * snapshot, worst-status-wins. Pure and container-free by design - every
 * dependency is a fetcher the caller (`system-rpc.ts`) wires to the real
 * `container.db`/`container.valkey`/etc, so this module (and its tests) never
 * touch a real database or Valkey connection, and a probe that hangs forever
 * is bounded here rather than by whatever called it.
 */

export type ComponentStatus = "ok" | "degraded" | "down";

export interface ComponentHealth {
  status: ComponentStatus;
  reason?: string;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface SchedulerHealth extends ComponentHealth {
  lockHolder: string | null;
  heartbeatAgeMs: number | null;
  queue: QueueCounts | null;
}

export interface ShardsHealth extends ComponentHealth {
  total: number;
  up: number;
  stale: number;
  worstLagMs: number | null;
}

export interface EventBusHealth extends ComponentHealth {
  lag: number | null;
  pending: number | null;
}

export interface ApiHealth extends ComponentHealth {
  uptimeSec: number;
  eventLoopLagP99Ms: number | null;
}

export interface LatencyHealth extends ComponentHealth {
  latencyMs: number | null;
}

export interface SystemStatusSnapshot {
  observedAt: string;
  status: ComponentStatus;
  components: {
    api: ApiHealth;
    postgres: LatencyHealth;
    valkey: LatencyHealth;
    scheduler: SchedulerHealth;
    shards: ShardsHealth;
    eventBus: EventBusHealth;
  };
}

/** A shard row more than 3 publish intervals old - mirrors `system-rpc.ts`'s `system.shards.get` threshold. */
export interface ShardsSnapshot {
  /** Expected shard count the cluster believes it spans; 0 for a single-process deployment with no telemetry yet. */
  total: number;
  /** Shards with status `Ready` and not stale. */
  up: number;
  /** Shards reporting but stale. */
  stale: number;
  /** Worst (highest) `eventLoopLagP99Ms` across reporting shards; null if none reported one yet. */
  worstLagMs: number | null;
}

export interface SchedulerHeartbeatInfo {
  holder: string;
  /** Age of the heartbeat row in ms, relative to "now". */
  ageMs: number;
}

export const StatusThresholds = {
  /** `probePostgres` latency beyond this is `degraded`, not `ok`. */
  postgresSlowMs: 500,
  /** `pingValkey` latency beyond this is `degraded`, not `ok`. */
  valkeySlowMs: 200,
  /** A heartbeat row older than this (ms) is treated as the scheduler being gone. */
  schedulerHeartbeatStaleMs: 30_000,
  /** Failed jobs at or above this count mark the scheduler `degraded`. */
  schedulerFailedJobsDegraded: 1,
  /** Combined waiting+delayed depth at or above this marks the scheduler `degraded`. */
  schedulerBacklogDegraded: 1_000,
  /** `api`'s own event-loop p99 lag beyond this is `degraded`. */
  apiEventLoopLagDegradedMs: 200,
  /** Pending (delivered-but-unacked) event-bus entries at or above this is `degraded`. */
  eventBusPendingDegraded: 500,
} as const;

export interface SystemStatusDeps {
  now?: () => number;
  /** Per-probe timeout (ms); a probe exceeding it is treated as `down`/unavailable. Default 3000. */
  probeTimeoutMs?: number;
  uptimeSec: () => number;
  eventLoopLagP99Ms: () => number | null;
  probePostgresLatencyMs: () => Promise<number>;
  pingValkey: () => Promise<string>;
  readSchedulerHeartbeat: () => Promise<SchedulerHeartbeatInfo | null>;
  readSchedulerQueueCounts: () => Promise<QueueCounts | null>;
  readShardsSnapshot: () => Promise<ShardsSnapshot>;
  readEventBusStats: () => Promise<{ lag: number | null; pending: number | null }>;
}

const DefaultProbeTimeoutMs = 3_000;

function worse(a: ComponentStatus, b: ComponentStatus): ComponentStatus {
  const rank: Record<ComponentStatus, number> = { ok: 0, degraded: 1, down: 2 };
  return rank[b] > rank[a] ? b : a;
}

async function probe<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  try {
    const value = await withTimeout(() => fn(), timeoutMs);
    return { ok: true, value };
  } catch (err: unknown) {
    if (err instanceof TimeoutError) {
      return { ok: false, reason: `timed out after ${timeoutMs}ms` };
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function buildPostgresHealth(
  deps: SystemStatusDeps,
  timeoutMs: number,
): Promise<LatencyHealth> {
  const result = await probe(() => deps.probePostgresLatencyMs(), timeoutMs);
  if (!result.ok) return { status: "down", reason: result.reason, latencyMs: null };
  const status: ComponentStatus =
    result.value > StatusThresholds.postgresSlowMs ? "degraded" : "ok";
  return {
    status,
    latencyMs: result.value,
    ...(status === "degraded" && { reason: `slow query: ${Math.round(result.value)}ms` }),
  };
}

async function buildValkeyHealth(
  deps: SystemStatusDeps,
  timeoutMs: number,
): Promise<LatencyHealth> {
  const start = (deps.now ?? Date.now)();
  const result = await probe(() => deps.pingValkey(), timeoutMs);
  if (!result.ok) return { status: "down", reason: result.reason, latencyMs: null };
  if (result.value !== "PONG") {
    return { status: "down", reason: `unexpected reply: ${result.value}`, latencyMs: null };
  }
  const latencyMs = (deps.now ?? Date.now)() - start;
  const status: ComponentStatus = latencyMs > StatusThresholds.valkeySlowMs ? "degraded" : "ok";
  return {
    status,
    latencyMs,
    ...(status === "degraded" && { reason: `slow ping: ${Math.round(latencyMs)}ms` }),
  };
}

async function buildSchedulerHealth(
  deps: SystemStatusDeps,
  timeoutMs: number,
): Promise<SchedulerHealth> {
  const heartbeatResult = await probe(() => deps.readSchedulerHeartbeat(), timeoutMs);
  if (!heartbeatResult.ok) {
    return {
      status: "down",
      reason: heartbeatResult.reason,
      lockHolder: null,
      heartbeatAgeMs: null,
      queue: null,
    };
  }

  const heartbeat = heartbeatResult.value;
  const queueResult = await probe(() => deps.readSchedulerQueueCounts(), timeoutMs);
  const queue = queueResult.ok ? queueResult.value : null;

  if (!heartbeat) {
    return {
      status: "down",
      reason: "no scheduler heartbeat observed",
      lockHolder: null,
      heartbeatAgeMs: null,
      queue,
    };
  }

  if (heartbeat.ageMs > StatusThresholds.schedulerHeartbeatStaleMs) {
    return {
      status: "down",
      reason: `heartbeat stale (${Math.round(heartbeat.ageMs)}ms old)`,
      lockHolder: heartbeat.holder,
      heartbeatAgeMs: heartbeat.ageMs,
      queue,
    };
  }

  let status: ComponentStatus = "ok";
  let reason: string | undefined;
  if (!queueResult.ok) {
    status = "degraded";
    reason = `queue depth unavailable: ${queueResult.reason}`;
  } else if (queue && queue.failed >= StatusThresholds.schedulerFailedJobsDegraded) {
    status = "degraded";
    reason = `${queue.failed} failed job(s)`;
  } else if (
    queue &&
    queue.waiting + queue.delayed >= StatusThresholds.schedulerBacklogDegraded
  ) {
    status = "degraded";
    reason = `backlog of ${queue.waiting + queue.delayed} job(s)`;
  }

  return {
    status,
    ...(reason !== undefined && { reason }),
    lockHolder: heartbeat.holder,
    heartbeatAgeMs: heartbeat.ageMs,
    queue,
  };
}

async function buildShardsHealth(
  deps: SystemStatusDeps,
  timeoutMs: number,
): Promise<ShardsHealth> {
  const result = await probe(() => deps.readShardsSnapshot(), timeoutMs);
  if (!result.ok) {
    return {
      status: "down",
      reason: result.reason,
      total: 0,
      up: 0,
      stale: 0,
      worstLagMs: null,
    };
  }

  const { total, up, stale, worstLagMs } = result.value;
  if (total === 0) {
    return { status: "ok", total, up, stale, worstLagMs };
  }
  if (up === 0) {
    return {
      status: "down",
      reason: "no shard is up",
      total,
      up,
      stale,
      worstLagMs,
    };
  }
  if (up < total || stale > 0) {
    return {
      status: "degraded",
      reason: `${up}/${total} shards up${stale > 0 ? `, ${stale} stale` : ""}`,
      total,
      up,
      stale,
      worstLagMs,
    };
  }
  return { status: "ok", total, up, stale, worstLagMs };
}

function buildApiHealth(deps: SystemStatusDeps): ApiHealth {
  const eventLoopLagP99Ms = deps.eventLoopLagP99Ms();
  const degraded =
    eventLoopLagP99Ms !== null &&
    eventLoopLagP99Ms > StatusThresholds.apiEventLoopLagDegradedMs;
  return {
    status: degraded ? "degraded" : "ok",
    ...(degraded && { reason: `event loop lag p99 ${Math.round(eventLoopLagP99Ms)}ms` }),
    uptimeSec: deps.uptimeSec(),
    eventLoopLagP99Ms,
  };
}

async function buildEventBusHealth(deps: SystemStatusDeps): Promise<EventBusHealth> {
  const { lag, pending } = await deps.readEventBusStats();
  const degraded = pending !== null && pending >= StatusThresholds.eventBusPendingDegraded;
  return {
    status: degraded ? "degraded" : "ok",
    ...(degraded && { reason: `${pending} pending entries` }),
    lag,
    pending,
  };
}

export async function getSystemStatus(
  deps: SystemStatusDeps,
): Promise<SystemStatusSnapshot> {
  const timeoutMs = deps.probeTimeoutMs ?? DefaultProbeTimeoutMs;
  const now = deps.now ?? Date.now;

  const [api, postgres, valkey, scheduler, shards, eventBus] = await Promise.all([
    Promise.resolve(buildApiHealth(deps)),
    buildPostgresHealth(deps, timeoutMs),
    buildValkeyHealth(deps, timeoutMs),
    buildSchedulerHealth(deps, timeoutMs),
    buildShardsHealth(deps, timeoutMs),
    buildEventBusHealth(deps),
  ]);

  const status = [api, postgres, valkey, scheduler, shards, eventBus].reduce(
    (acc, component) => worse(acc, component.status),
    "ok" as ComponentStatus,
  );

  return {
    observedAt: new Date(now()).toISOString(),
    status,
    components: { api, postgres, valkey, scheduler, shards, eventBus },
  };
}
