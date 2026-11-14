import { TimeoutError, withTimeout } from "@utilities/Resilience.js";
import type {
  SystemApiHealth,
  SystemComponentStatus,
  SystemEventBusHealth,
  SystemLatencyHealth,
  SystemQueueCounts,
  SystemSchedulerHealth,
  SystemShardsHealth,
  SystemStatusData,
} from "@contracts/rpc/System.js";

export interface ShardsSnapshot {

  total: number;

  up: number;

  stale: number;

  worstLagMs: number | null;
}

export interface SchedulerHeartbeatInfo {
  holder: string;

  ageMs: number;
}

export const StatusThresholds = {

  postgresSlowMs: 500,

  redisSlowMs: 200,

  schedulerHeartbeatStaleMs: 30_000,

  schedulerFailedJobsDegraded: 1,

  schedulerBacklogDegraded: 1_000,

  apiEventLoopLagDegradedMs: 200,

  eventBusPendingDegraded: 500,
} as const;

export interface SystemStatusDeps {
  now?: () => number;

  probeTimeoutMs?: number;
  uptimeSec: () => number;
  eventLoopLagP99Ms: () => number | null;
  probePostgresLatencyMs: () => Promise<number>;
  pingRedis: () => Promise<string>;
  readSchedulerHeartbeat: () => Promise<SchedulerHeartbeatInfo | null>;
  readSchedulerQueueCounts: () => Promise<SystemQueueCounts | null>;
  readShardsSnapshot: () => Promise<ShardsSnapshot>;
  readEventBusStats: () => Promise<{ lag: number | null; pending: number | null }>;
}

const DefaultProbeTimeoutMs = 3_000;

function worse(a: SystemComponentStatus, b: SystemComponentStatus): SystemComponentStatus {
  const rank: Record<SystemComponentStatus, number> = { ok: 0, degraded: 1, down: 2 };
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
): Promise<SystemLatencyHealth> {
  const result = await probe(() => deps.probePostgresLatencyMs(), timeoutMs);
  if (!result.ok) return { status: "down", reason: result.reason, latencyMs: null };
  const status: SystemComponentStatus =
    result.value > StatusThresholds.postgresSlowMs ? "degraded" : "ok";
  return {
    status,
    latencyMs: result.value,
    ...(status === "degraded" && { reason: `slow query: ${Math.round(result.value)}ms` }),
  };
}

async function buildRedisHealth(
  deps: SystemStatusDeps,
  timeoutMs: number,
): Promise<SystemLatencyHealth> {
  const start = (deps.now ?? Date.now)();
  const result = await probe(() => deps.pingRedis(), timeoutMs);
  if (!result.ok) return { status: "down", reason: result.reason, latencyMs: null };
  if (result.value !== "PONG") {
    return { status: "down", reason: `unexpected reply: ${result.value}`, latencyMs: null };
  }
  const latencyMs = (deps.now ?? Date.now)() - start;
  const status: SystemComponentStatus = latencyMs > StatusThresholds.redisSlowMs ? "degraded" : "ok";
  return {
    status,
    latencyMs,
    ...(status === "degraded" && { reason: `slow ping: ${Math.round(latencyMs)}ms` }),
  };
}

async function buildSchedulerHealth(
  deps: SystemStatusDeps,
  timeoutMs: number,
): Promise<SystemSchedulerHealth> {
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

  let status: SystemComponentStatus = "ok";
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
): Promise<SystemShardsHealth> {
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

function buildApiHealth(deps: SystemStatusDeps): SystemApiHealth {
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

async function buildEventBusHealth(deps: SystemStatusDeps): Promise<SystemEventBusHealth> {
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
): Promise<SystemStatusData> {
  const timeoutMs = deps.probeTimeoutMs ?? DefaultProbeTimeoutMs;
  const now = deps.now ?? Date.now;

  const [api, postgres, redis, scheduler, shards, eventBus] = await Promise.all([
    Promise.resolve(buildApiHealth(deps)),
    buildPostgresHealth(deps, timeoutMs),
    buildRedisHealth(deps, timeoutMs),
    buildSchedulerHealth(deps, timeoutMs),
    buildShardsHealth(deps, timeoutMs),
    buildEventBusHealth(deps),
  ]);

  const status = [api, postgres, redis, scheduler, shards, eventBus].reduce(
    (acc, component) => worse(acc, component.status),
    "ok" as SystemComponentStatus,
  );

  return {
    observedAt: new Date(now()).toISOString(),
    status,
    components: { api, postgres, redis, scheduler, shards, eventBus },
  };
}
