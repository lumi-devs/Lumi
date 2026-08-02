// Cluster-wide "all shards ready" signal. During a multi-replica gateway's startup,
// workers consuming the raw-gateway bus can receive events while some shards are still
// IDENTIFYing, so their view of guild/channel/member state is partial. Most handlers
// tolerate that (REST + entity cache on demand), but cooperative populators and
// cache-seeding flows want a clean "cluster has converged" signal.
//
// Each gateway replica tracks its own readiness under a per-replica key
// (`lumi:cluster:<name>:ready:<replicaId>`), refreshed on each heartbeat so a
// crashed gateway's flag expires within `ttlMs`. `isReady()` cross-references
// that against ClusterCoordinator's live-membership set
// (`lumi:cluster:<name>:members`) and only reports ready once every
// currently-live replica has published readiness. Gateways call
// `publishReady(true)` from the Ready/Resumed handler when
// `shardReady.size === expectedShards.size` and `publishReady(false)` on
// Close/Error; workers call `waitForReady()` before starting their consumer
// loops.

import type { Redis } from "ioredis";
import { membersKey } from "./coordinator.js";

const readyKey = (name: string, replicaId: string) =>
  `lumi:cluster:${name}:ready:${replicaId}`;

export interface ClusterReadyTrackerOptions {
  redis: Redis;
  clusterName: string;
  /** This replica's id, used to key its own readiness flag. */
  replicaId: string;
  /** TTL on the ready key; refreshed by `publishReady(true)`. Default 30s. */
  ttlMs?: number;
}

export class ClusterReadyTracker {
  private readonly ttlMs: number;

  public constructor(private readonly opts: ClusterReadyTrackerOptions) {
    this.ttlMs = opts.ttlMs ?? 30_000;
  }

  /**
   * Set or clear this replica's own ready flag. Idempotent. A gateway should
   * call `publishReady(true)` once all its owned shards are Ready/Resumed,
   * and `publishReady(false)` on any shard close/error. Workers observe the
   * cluster-wide state via `isReady()` / `waitForReady()`.
   */
  public async publishReady(ready: boolean): Promise<void> {
    const key = readyKey(this.opts.clusterName, this.opts.replicaId);
    if (ready) {
      await this.opts.redis.set(key, "1", "PX", this.ttlMs);
    } else {
      await this.opts.redis.set(key, "0", "PX", this.ttlMs);
    }
  }

  public async isReady(): Promise<boolean> {
    const liveIds = await this.opts.redis.zrange(
      membersKey(this.opts.clusterName),
      0,
      -1,
    );
    if (liveIds.length === 0) return false;

    const values = await Promise.all(
      liveIds.map((id) =>
        this.opts.redis.get(readyKey(this.opts.clusterName, id)),
      ),
    );
    return values.every((v) => v === "1");
  }

  /**
   * Block until the cluster reports ready, polling every `pollMs` (default 1s).
   * Returns immediately if already ready. Throws on abort signal.
   */
  public async waitForReady(
    opts: { pollMs?: number; signal?: AbortSignal } = {},
  ): Promise<void> {
    const pollMs = opts.pollMs ?? 1_000;
    while (!opts.signal?.aborted) {
      if (await this.isReady()) return;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error("waitForReady aborted");
  }
}
