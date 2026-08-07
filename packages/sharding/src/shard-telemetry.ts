// Durable per-shard health. The coordinator persists *intent* (which replica owns
// which shard ids) and the session store persists *resumability*, but neither knows
// whether a shard's WebSocket is actually up: status, gateway latency and guild
// count are only visible inside the process holding the socket. Each WS-holding
// replica therefore publishes one row per owned shard on an interval, under a key
// whose TTL is a small multiple of that interval.
//
// The TTL is the point. A replica that crashes stops refreshing and its rows expire
// rather than lingering as a stale "Ready", so an assigned shard with no row is
// unambiguously a shard nobody is running.

import type { Redis } from "ioredis";
import { tryParseJSON } from "@sapphire/utilities";
import { assignmentKey, membersKey, type ClusterAssignment } from "./coordinator.js";
import { readyKey } from "./cluster-ready.js";
import { sessionKey } from "./session-store.js";

/** Namespace used when `CLUSTER_NAME` is unset, so single-process deployments still report. */
export const DEFAULT_CLUSTER_NAME = "default";

const shardKey = (cluster: string, shardId: number) =>
  `lumi:cluster:${cluster}:shard:${shardId}`;

export interface ShardTelemetry {
  shardId: number;
  /** Process/replica currently holding this shard's WebSocket. */
  replicaId: string;
  /** discord.js `Status` name, e.g. `Ready`, `Connecting`, `Reconnecting`. */
  status: string;
  /** Gateway heartbeat round-trip in ms; null until the first heartbeat lands. */
  ping: number | null;
  guildCount: number;
  /** Total shards the reporting process believes the cluster spans. */
  shardCount: number;
  /** Wall-clock of this sample (ms). */
  updatedAt: number;
}

/** One sample of every shard this process currently owns. */
export type ShardTelemetrySample = Omit<
  ShardTelemetry,
  "replicaId" | "updatedAt"
>;

export interface ShardTelemetryPublisherOptions {
  redis: Redis;
  clusterName: string;
  replicaId: string;
  sample: () => readonly ShardTelemetrySample[];
  /** Publish interval (ms). Default 10_000. */
  intervalMs?: number;
  /** Row TTL (ms). Default `intervalMs * 3`. */
  ttlMs?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

export class ShardTelemetryPublisher {
  private readonly intervalMs: number;
  private readonly ttlMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private published = new Set<number>();

  public constructor(private readonly opts: ShardTelemetryPublisherOptions) {
    this.intervalMs = opts.intervalMs ?? 10_000;
    this.ttlMs = opts.ttlMs ?? this.intervalMs * 3;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.publish().catch((err) =>
        this.opts.log?.("warn", "shard telemetry publish failed", {
          err: String(err),
        }),
      );
    }, this.intervalMs);
  }

  public async publish(): Promise<void> {
    const rows = this.opts.sample();
    const now = Date.now();
    const pipe = this.opts.redis.multi();
    const seen = new Set<number>();
    for (const row of rows) {
      seen.add(row.shardId);
      pipe.set(
        shardKey(this.opts.clusterName, row.shardId),
        JSON.stringify({
          ...row,
          replicaId: this.opts.replicaId,
          updatedAt: now,
        } satisfies ShardTelemetry),
        "PX",
        this.ttlMs,
      );
    }
    // A shard handed to another replica must stop being reported by us
    // immediately; waiting for the TTL would show it twice.
    for (const shardId of this.published) {
      if (!seen.has(shardId)) {
        pipe.del(shardKey(this.opts.clusterName, shardId));
      }
    }
    this.published = seen;
    // `exec()` resolves with per-command `[err, result]` pairs rather than
    // rejecting, so without this a telemetry write can fail on every tick and
    // the fleet view just shows nothing.
    const results = await pipe.exec();
    if (results === null) throw new Error("shard telemetry MULTI was discarded");
    const failure = results.find(([err]) => err)?.[0];
    if (failure) throw failure;
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.published.size === 0) return;
    const pipe = this.opts.redis.multi();
    for (const shardId of this.published) {
      pipe.del(shardKey(this.opts.clusterName, shardId));
    }
    this.published = new Set();
    try {
      await pipe.exec();
    } catch (err) {
      this.opts.log?.("warn", "shard telemetry cleanup failed", {
        err: String(err),
      });
    }
  }
}

/** Gateway session persisted for a shard, when the cluster session store is installed. */
export interface ShardSessionState {
  sequence: number;
  resumeUrl: string | null;
}

export interface ClusterReplicaState {
  replicaId: string;
  /** Last coordinator heartbeat (ms), or null when the replica is not in the member set. */
  lastSeenAt: number | null;
  /** Self-published readiness; null when the replica never published one. */
  ready: boolean | null;
  /** Shard ids the assignment says this replica owns. */
  assignedShardIds: number[];
  /** Shard ids this replica is actually reporting telemetry for. */
  reportingShardIds: number[];
}

export interface ClusterShardsSnapshot {
  clusterName: string;
  /** False when no coordinator assignment exists — a single-process deployment. */
  clustered: boolean;
  epoch: number | null;
  assignedAt: number | null;
  shardCount: number;
  observedAt: number;
  replicas: ClusterReplicaState[];
  shards: (ShardTelemetry & { session: ShardSessionState | null })[];
  /** Expected shard ids with no live telemetry row. */
  missingShardIds: number[];
}

const GLOB_SPECIALS = /[*?[\]\\]/g;

export interface ReadClusterShardsOptions {
  redis: Redis;
  clusterName: string;
  /** SCAN batch size. Default 200. */
  scanCount?: number;
}

/**
 * Assemble the operator-facing cluster view from the four things that outlive
 * any single process: the assignment blob, the member heartbeat set, the
 * per-replica ready flags and the TTL'd shard telemetry rows.
 */
export async function readClusterShards(
  opts: ReadClusterShardsOptions,
): Promise<ClusterShardsSnapshot> {
  const { redis, clusterName } = opts;
  const pattern = `lumi:cluster:${clusterName.replace(GLOB_SPECIALS, "\\$&")}:shard:*`;

  const [assignmentRaw, memberEntries, shardKeys] = await Promise.all([
    redis.get(assignmentKey(clusterName)),
    redis.zrange(membersKey(clusterName), 0, -1, "WITHSCORES"),
    scanKeys(redis, pattern, opts.scanCount ?? 200),
  ]);

  const assignment = assignmentRaw
    ? ((tryParseJSON(assignmentRaw) as ClusterAssignment | null) ?? null)
    : null;

  const rows: ShardTelemetry[] = [];
  if (shardKeys.length > 0) {
    const values = await redis.mget(...shardKeys);
    for (const raw of values) {
      if (!raw) continue;
      const parsed = tryParseJSON(raw) as ShardTelemetry | null;
      if (parsed && typeof parsed.shardId === "number") rows.push(parsed);
    }
  }
  rows.sort((a, b) => a.shardId - b.shardId);

  const shardCount =
    assignment?.shardCount ??
    rows.reduce((max, r) => Math.max(max, r.shardCount ?? 0), 0);

  const sessions = await readSessions(
    redis,
    clusterName,
    rows.map((r) => r.shardId),
  );

  const lastSeen = new Map<string, number>();
  for (let i = 0; i < memberEntries.length; i += 2) {
    const id = memberEntries[i];
    const score = Number(memberEntries[i + 1]);
    if (id !== undefined && Number.isFinite(score)) lastSeen.set(id, score);
  }

  const replicaIds = new Set<string>([
    ...Object.keys(assignment?.byReplica ?? {}),
    ...lastSeen.keys(),
    ...rows.map((r) => r.replicaId),
  ]);
  const readyValues = await Promise.all(
    [...replicaIds].map((id) => redis.get(readyKey(clusterName, id))),
  );

  const replicas: ClusterReplicaState[] = [...replicaIds]
    .map((replicaId, index) => {
      const ready = readyValues[index];
      return {
        replicaId,
        lastSeenAt: lastSeen.get(replicaId) ?? null,
        ready: ready === null || ready === undefined ? null : ready === "1",
        assignedShardIds: assignment?.byReplica[replicaId] ?? [],
        reportingShardIds: rows
          .filter((r) => r.replicaId === replicaId)
          .map((r) => r.shardId),
      };
    })
    .sort((a, b) => a.replicaId.localeCompare(b.replicaId));

  const reporting = new Set(rows.map((r) => r.shardId));
  const missingShardIds: number[] = [];
  for (let id = 0; id < shardCount; id++) {
    if (!reporting.has(id)) missingShardIds.push(id);
  }

  return {
    clusterName,
    clustered: assignment !== null,
    epoch: assignment?.epoch ?? null,
    assignedAt: assignment?.writtenAt ?? null,
    shardCount,
    observedAt: Date.now(),
    replicas,
    shards: rows.map((r) => ({
      ...r,
      session: sessions.get(r.shardId) ?? null,
    })),
    missingShardIds,
  };
}

async function readSessions(
  redis: Redis,
  clusterName: string,
  shardIds: readonly number[],
): Promise<Map<number, ShardSessionState>> {
  const out = new Map<number, ShardSessionState>();
  if (shardIds.length === 0) return out;
  const values = await redis.mget(
    ...shardIds.map((id) => sessionKey(clusterName, id)),
  );
  values.forEach((raw, index) => {
    if (!raw) return;
    const parsed = tryParseJSON(raw) as {
      sequence?: number;
      resumeURL?: string;
    } | null;
    if (!parsed || typeof parsed.sequence !== "number") return;
    out.set(shardIds[index]!, {
      sequence: parsed.sequence,
      resumeUrl: parsed.resumeURL ?? null,
    });
  });
  return out;
}

async function scanKeys(
  redis: Redis,
  pattern: string,
  count: number,
): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      count,
    );
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}
