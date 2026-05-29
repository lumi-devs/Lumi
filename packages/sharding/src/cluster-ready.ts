// Cluster-wide "all shards ready" signal.
//
// Workers consuming the raw-gateway bus during a multi-replica gateway's
// startup can receive events while some shards are still IDENTIFYing — at
// which point the worker's view of guild/channel/member state is partial.
// Most handlers are robust to this (they fetch from REST + entity cache on
// demand), but cooperative populators (S8 slice 3) and cache-seeding flows
// benefit from a clean "wait until the cluster has converged" signal.
//
// Protocol (per cluster, namespaced by clusterName):
//   ember:cluster:<name>:ready  STR  "1" when every gateway replica reports
//                                    all its shards Ready/Resumed; absent or
//                                    "0" otherwise. TTL refreshed on each
//                                    heartbeat so a crashed gateway flips it
//                                    back to not-ready within `ttlMs`.
//
// Gateways call `publishReady(true)` from the WSManager Ready/Resumed handler
// once `shardReady.size === expectedShards.size`, and `publishReady(false)`
// on any Close/Error. Workers call `waitForReady()` before starting their
// raw-gateway consumer loops.

import type { Redis } from "ioredis";

const readyKey = (name: string) => `ember:cluster:${name}:ready`;

export interface ClusterReadyTrackerOptions {
  redis: Redis;
  clusterName: string;
  /** TTL on the ready key; refreshed by `publishReady(true)`. Default 30s. */
  ttlMs?: number;
}

export class ClusterReadyTracker {
  private readonly ttlMs: number;

  public constructor(private readonly opts: ClusterReadyTrackerOptions) {
    this.ttlMs = opts.ttlMs ?? 30_000;
  }

  /**
   * Set or clear the cluster-ready flag. Idempotent. A gateway should call
   * `publishReady(true)` once all its owned shards are Ready/Resumed, and
   * `publishReady(false)` on any shard close/error. Workers observe the flag
   * via `isReady()` / `waitForReady()`.
   */
  public async publishReady(ready: boolean): Promise<void> {
    const key = readyKey(this.opts.clusterName);
    if (ready) {
      await this.opts.redis.set(key, "1", "PX", this.ttlMs);
    } else {
      await this.opts.redis.set(key, "0", "PX", this.ttlMs);
    }
  }

  public async isReady(): Promise<boolean> {
    const v = await this.opts.redis.get(readyKey(this.opts.clusterName));
    return v === "1";
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
