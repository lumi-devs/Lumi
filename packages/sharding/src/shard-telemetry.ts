// Durable per-shard health. Nothing else persists which shard is running where, so
// status, gateway latency and guild count are only visible inside the process
// holding the socket. Each WS-holding replica therefore publishes one row per owned
// shard on an interval, under a key whose TTL is a small multiple of that interval.
//
// The TTL is the point. A replica that crashes stops refreshing and its rows expire
// rather than lingering as a stale "Ready", so a shard with no row is unambiguously
// a shard nobody is running.

import type { Cluster, Redis } from "ioredis";

/** Either topology - callers may run Redis standalone, Sentinel, or Cluster. */
type RedisClient = Redis | Cluster;
import { tryParseJSON } from "@sapphire/utilities";

/** Namespace used when `CLUSTER_NAME` is unset, so single-process deployments still report. */
export const DefaultClusterName = "default";

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
  redis: RedisClient;
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

export interface ClusterReplicaState {
  replicaId: string;
  /** Shard ids this replica is actually reporting telemetry for. */
  reportingShardIds: number[];
}

export interface ClusterShardsSnapshot {
  clusterName: string;
  shardCount: number;
  observedAt: number;
  replicas: ClusterReplicaState[];
  shards: ShardTelemetry[];
  /** Expected shard ids with no live telemetry row. */
  missingShardIds: number[];
}

const GlobSpecials = /[*?[\]\\]/g;

export interface ReadClusterShardsOptions {
  redis: RedisClient;
  clusterName: string;
  /** SCAN batch size. Default 200. */
  scanCount?: number;
}

/**
 * Assemble the operator-facing cluster view from the one thing that outlives
 * any single process: the TTL'd shard telemetry rows.
 */
export async function readClusterShards(
  opts: ReadClusterShardsOptions,
): Promise<ClusterShardsSnapshot> {
  const { redis, clusterName } = opts;
  const pattern = `lumi:cluster:${clusterName.replace(GlobSpecials, "\\$&")}:shard:*`;

  const shardKeys = await scanKeys(redis, pattern, opts.scanCount ?? 200);

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

  const shardCount = rows.reduce((max, r) => Math.max(max, r.shardCount ?? 0), 0);

  const replicaIds = new Set<string>(rows.map((r) => r.replicaId));

  const replicas: ClusterReplicaState[] = [...replicaIds]
    .map((replicaId) => ({
      replicaId,
      reportingShardIds: rows
        .filter((r) => r.replicaId === replicaId)
        .map((r) => r.shardId),
    }))
    .sort((a, b) => a.replicaId.localeCompare(b.replicaId));

  const reporting = new Set(rows.map((r) => r.shardId));
  const missingShardIds: number[] = [];
  for (let id = 0; id < shardCount; id++) {
    if (!reporting.has(id)) missingShardIds.push(id);
  }

  return {
    clusterName,
    shardCount,
    observedAt: Date.now(),
    replicas,
    shards: rows,
    missingShardIds,
  };
}

async function scanKeys(
  redis: RedisClient,
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
