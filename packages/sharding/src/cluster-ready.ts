// Cluster-wide "all shards ready" signal. During a multi-replica gateway's startup,
// workers consuming the raw-gateway bus can receive events while some shards are still
// IDENTIFYing, so their view of guild/channel/member state is partial. Most handlers
// tolerate that (REST + entity cache on demand), but cooperative populators and
// cache-seeding flows want a clean "cluster has converged" signal.
//
// `lumi:cluster:<name>:ready` holds "1" once every gateway replica reports all its
// shards Ready/Resumed (absent or "0" otherwise); the TTL is refreshed on each
// heartbeat so a crashed gateway flips back to not-ready within `ttlMs`. Gateways call
// `publishReady(true)` from the Ready/Resumed handler when
// `shardReady.size === expectedShards.size` and `publishReady(false)` on Close/Error;
// workers call `waitForReady()` before starting their consumer loops.

import type { Redis } from "ioredis";

const readyKey = (name: string) => `lumi:cluster:${name}:ready`;

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
