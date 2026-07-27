// Cluster IDENTIFY throttling.
//
// Discord's IDENTIFY limit is `max_concurrency` per 5-second window, bucketed
// by `shardId % max_concurrency`. With a single process, `SimpleIdentifyThrottler`
// from @discordjs/ws is enough. With multiple gateway replicas owning disjoint
// shard ranges, each process throttling locally could collide — two replicas
// could each IDENTIFY shard 0's bucket within the same 5s window, get one
// of them session-invalidated, and burn a slot.
//
// This throttler funnels every IDENTIFY through Redis. Per bucket we hold a
// short-lived lock (`SET NX EX`) for the IDENTIFY duration. If the lock is
// taken we sleep until it expires and retry. The 5-second window is enforced
// by storing the *last-identify timestamp* per bucket and gating the lock
// acquisition behind it.

import type { Redis } from "ioredis";
import type { IIdentifyThrottler } from "@discordjs/ws";
import { sleep } from "@sapphire/utilities";

const WINDOW_MS = 5_000;

export interface RedisIdentifyThrottlerOptions {
  redis: Redis;
  clusterName: string;
  /** Discord's max_concurrency (from /gateway/bot). */
  maxConcurrency: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

const bucketKey = (cluster: string, bucket: number) =>
  `lumi:cluster:${cluster}:identify-bucket:${bucket}`;

export class RedisIdentifyThrottler implements IIdentifyThrottler {
  public constructor(private readonly opts: RedisIdentifyThrottlerOptions) {}

  public async waitForIdentify(
    shardId: number,
    signal: AbortSignal,
  ): Promise<void> {
    const bucket = shardId % this.opts.maxConcurrency;
    const key = bucketKey(this.opts.clusterName, bucket);
    // Loop until we land the lock or are aborted.
    // SET NX PX <window>: only one identifier in the bucket per window.
    while (!signal.aborted) {
      const ok = await this.opts.redis.set(
        key,
        `${shardId}:${Date.now()}`,
        "PX",
        WINDOW_MS,
        "NX",
      );
      if (ok === "OK") return;
      const pttl = await this.opts.redis.pttl(key);
      const waitMs = pttl > 0 ? Math.min(pttl + 25, WINDOW_MS) : 250;
      await sleep(waitMs, undefined, { signal });
    }
    throw new Error("RedisIdentifyThrottler aborted");
  }
}

export function buildRedisThrottlerFactory(
  opts: RedisIdentifyThrottlerOptions,
) {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (): Promise<IIdentifyThrottler> =>
    new RedisIdentifyThrottler(opts);
}
