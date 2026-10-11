import type { Cluster } from "iovalkey";
import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import { tryParseJSON } from "#src/shared/Index.ts";

function isClusterClient(valkey: ValkeyClient): boolean {
  return (
    typeof (valkey as { nodes?: unknown }).nodes === "function" &&
    (valkey as Cluster).nodes("master").length > 0
  );
}

export const DefaultClusterName = "default";

const shardKey = (cluster: string, shardId: number) =>
  `lumi:cluster:${cluster}:shard:${shardId}`;

interface ShardTelemetry {
  shardId: number;

  replicaId: string;

  status: string;

  ping: number | null;
  guildCount: number;

  shardCount: number;

  updatedAt: number;

  eventLoopLagP99Ms: number | null;

  memoryRssMb: number;

  heapUsedMb: number;

  uptimeSec: number;

  pid: number;

  lastReadyAt: number | null;

  logs?: Array<{ timestamp: string; level: string; message: string }>;
}

export const DefaultPublishIntervalMs = 10_000;

export type ShardTelemetrySample = Omit<
  ShardTelemetry,
  "replicaId" | "updatedAt"
>;

export interface ShardTelemetryPublisherOptions {
  valkey: ValkeyClient;
  clusterName: string;
  replicaId: string;
  sample: () => readonly ShardTelemetrySample[];

  intervalMs?: number;

  ttlMs?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

export class ShardTelemetryPublisher {
  private readonly intervalMs: number;
  private readonly ttlMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private published = new Set<number>();

  public constructor(private readonly opts: ShardTelemetryPublisherOptions) {
    this.intervalMs = opts.intervalMs ?? DefaultPublishIntervalMs;
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
    const writes: Promise<unknown>[] = [];
    const seen = new Set<number>();
    for (const row of rows) {
      seen.add(row.shardId);
      writes.push(
        this.opts.valkey.set(
          shardKey(this.opts.clusterName, row.shardId),
          JSON.stringify({
            ...row,
            replicaId: this.opts.replicaId,
            updatedAt: now,
          } satisfies ShardTelemetry),
          "PX",
          this.ttlMs,
        ),
      );
    }
    for (const shardId of this.published) {
      if (!seen.has(shardId)) {
        writes.push(this.opts.valkey.del(shardKey(this.opts.clusterName, shardId)));
      }
    }
    this.published = seen;
    await Promise.all(writes);
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.published.size === 0) return;
    const keys = [...this.published].map((shardId) =>
      shardKey(this.opts.clusterName, shardId),
    );
    this.published = new Set();
    try {
      await Promise.all(keys.map((key) => this.opts.valkey.del(key)));
    } catch (err) {
      this.opts.log?.("warn", "shard telemetry cleanup failed", {
        err: String(err),
      });
    }
  }
}

export function isShardStale(
  row: Pick<ShardTelemetry, "updatedAt">,
  nowMs: number,
  staleAfterMs: number,
): boolean {
  return nowMs - row.updatedAt > staleAfterMs;
}

const lastReadyAtByShard = new Map<number, number>();

export function recordShardReady(shardId: number, atMs: number = Date.now()): void {
  lastReadyAtByShard.set(shardId, atMs);
}

export function getLastReadyAt(shardId: number): number | null {
  return lastReadyAtByShard.get(shardId) ?? null;
}

interface ClusterReplicaState {
  replicaId: string;

  reportingShardIds: number[];
}

export interface ClusterShardsSnapshot {
  clusterName: string;
  shardCount: number;
  observedAt: number;
  replicas: ClusterReplicaState[];
  shards: ShardTelemetry[];

  missingShardIds: number[];
}

const GlobSpecials = /[*?[\]\\]/g;

export interface ReadClusterShardsOptions {
  valkey: ValkeyClient;
  clusterName: string;

  scanCount?: number;
}

export async function readClusterShards(
  opts: ReadClusterShardsOptions,
): Promise<ClusterShardsSnapshot> {
  const { valkey, clusterName } = opts;
  const pattern = `lumi:cluster:${clusterName.replace(GlobSpecials, "\\$&")}:shard:*`;

  const shardKeys = await scanKeys(valkey, pattern, opts.scanCount ?? 200);

  const rows: ShardTelemetry[] = [];
  if (shardKeys.length > 0) {
    let values: (string | null)[];
    try {
      values = await valkey.mget(...shardKeys);
    } catch {
      values = await Promise.all(shardKeys.map((key) => valkey.get(key)));
    }
    for (const raw of values) {
      if (!raw) continue;
      const parsed = tryParseJSON(raw) as ShardTelemetry | null;
      if (parsed && typeof parsed.shardId === "number") rows.push(parsed);
    }
  }
  rows.sort((a, b) => a.shardId - b.shardId);

  if (rows.length > 0) {
    try {
      const rawLogs = await Promise.all(
        rows.map((r) =>
          valkey.lrange(`lumi:cluster:${clusterName}:shardlogs:${r.shardId}`, -50, -1),
        ),
      );
      for (let i = 0; i < rows.length; i++) {
        const list = rawLogs[i] ?? [];
        rows[i]!.logs = list.map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return {
              timestamp: new Date().toISOString(),
              level: "info",
              message: line,
            };
          }
        });
      }
    } catch {
      // Valkey lrange failure shouldn't prevent shard telemetry from returning
    }
  }

  const shardCount = rows.reduce((max, r) => Math.max(max, r.shardCount ?? 0), 0);

  const byReplica = new Map<string, number[]>();
  for (const r of rows) {
    const bucket = byReplica.get(r.replicaId);
    if (bucket) bucket.push(r.shardId);
    else byReplica.set(r.replicaId, [r.shardId]);
  }

  const replicas: ClusterReplicaState[] = [...byReplica]
    .map(([replicaId, reportingShardIds]) => ({
      replicaId,
      reportingShardIds,
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
  valkey: ValkeyClient,
  pattern: string,
  count: number,
): Promise<string[]> {
  if (isClusterClient(valkey)) {
    const perNode = await Promise.all(
      (valkey as Cluster)
        .nodes("master")
        .map((node) => scanNode(node, pattern, count)),
    );
    return perNode.flat();
  }
  return scanNode(valkey, pattern, count);
}

async function scanNode(
  node: { scan(cursor: string, matchKey: string, matchVal: string, countKey: string, countVal: number): Promise<[string, string[]]> },
  pattern: string,
  count: number,
): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await node.scan(
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
