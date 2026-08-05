// Redis-based cluster shard assignment coordinator.
// Maps gateway replicas to shard IDs without a separate control plane.

import type { Redis } from "ioredis";
import { tryParseJSON } from "@sapphire/utilities";

export interface ShardDelta {
  /** Shard ids this replica should START owning (spawn + identify/resume). */
  added: readonly number[];
  /** Shard ids this replica should STOP owning (destroy WS). */
  removed: readonly number[];
  /** Shard ids this replica continues to own (no action required). */
  unchanged: readonly number[];
}

export interface ClusterAssignment {
  epoch: number;
  shardCount: number;
  /** Replica id → sorted shard ids owned. */
  byReplica: Record<string, number[]>;
  /** Wall-clock when written (ms). */
  writtenAt: number;
}

export interface ClusterCoordinatorOptions {
  /** Connection used for normal commands (ZADD/EVAL/GET/SET). */
  redis: Redis;
  /**
   * Dedicated connection used for SUBSCRIBE on the `:rebalance` channel.
   * Must NOT be shared with `redis` - subscribed connections cannot run
   * normal commands.
   */
  subscriber: Redis;
  /** Logical cluster name; lets prod + staging share a Redis without colliding. */
  clusterName: string;
  /** This replica's id (stable across restarts ⇒ less churn). */
  replicaId: string;
  /** Total shard count (from planShards). */
  shardCount: number;
  /** Heartbeat refresh interval (ms). Default 5_000. */
  heartbeatIntervalMs?: number;
  /** Member is considered dead if its heartbeat score < now - this (ms). Default 15_000. */
  memberTtlMs?: number;
  /**
   * Leader-lock TTL (ms). The leader is whoever wins SET NX EX on the lock;
   * lock expiry means the next heartbeat picks a (possibly new) leader.
   * Default 5_000.
   */
  leaderLockTtlMs?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

export interface JoinResult {
  /** Initial shard ids this replica owns. */
  shards: number[];
  /** Current assignment epoch. */
  epoch: number;
  /** Full assignment snapshot (debug/observability). */
  assignment: ClusterAssignment;
}

export type RebalanceListener = (
  delta: ShardDelta,
  assignment: ClusterAssignment,
) => void | Promise<void>;

/**
 * Divide `shardCount` contiguous ids across `replicaIds` (sorted) as evenly
 * as possible. The first `shardCount % n` replicas get one extra shard.
 *
 * Exported for tests and the resilience suite.
 */
export function assignShards(
  replicaIds: readonly string[],
  shardCount: number,
): Record<string, number[]> {
  const sorted = [...replicaIds].sort();
  const n = sorted.length;
  const out: Record<string, number[]> = {};
  if (n === 0 || shardCount <= 0) {
    for (const id of sorted) out[id] = [];
    return out;
  }
  const base = Math.floor(shardCount / n);
  const extra = shardCount % n;
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < extra ? 1 : 0);
    const slice: number[] = [];
    for (let s = 0; s < size; s++) slice.push(cursor + s);
    out[sorted[i]!] = slice;
    cursor += size;
  }
  return out;
}

function diff(prev: readonly number[], next: readonly number[]): ShardDelta {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const added: number[] = [];
  const removed: number[] = [];
  const unchanged: number[] = [];
  for (const id of next) {
    if (prevSet.has(id)) unchanged.push(id);
    else added.push(id);
  }
  for (const id of prev) if (!nextSet.has(id)) removed.push(id);
  return { added, removed, unchanged };
}

/** Compare-and-set the assignment blob: ARGV[1] is the expected value ("" = absent). */
const CAS_ASSIGNMENT_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if (cur == false and ARGV[1] == '') or cur == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0
`;

export const membersKey = (name: string) => `lumi:cluster:${name}:members`;
const assignmentKey = (name: string) => `lumi:cluster:${name}:assignment`;
const leaderLockKey = (name: string) => `lumi:cluster:${name}:leader-lock`;
const rebalanceChannel = (name: string) => `lumi:cluster:${name}:rebalance`;

export class ClusterCoordinator {
  private readonly opts: Required<Omit<ClusterCoordinatorOptions, "log">> & {
    log: NonNullable<ClusterCoordinatorOptions["log"]>;
  };

  private readonly listeners = new Set<RebalanceListener>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentShards: number[] = [];
  private currentEpoch = -1;
  private closed = false;
  private applyChain: Promise<void> = Promise.resolve();

  private messageListener: ((ch: string, payload: string) => void) | null = null;

  public constructor(options: ClusterCoordinatorOptions) {
    this.opts = {
      redis: options.redis,
      subscriber: options.subscriber,
      clusterName: options.clusterName,
      replicaId: options.replicaId,
      shardCount: options.shardCount,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 5_000,
      memberTtlMs: options.memberTtlMs ?? 15_000,
      leaderLockTtlMs: options.leaderLockTtlMs ?? 5_000,
      log:
        options.log ??
        ((lvl, msg, meta) => {
          const line = meta
            ? `[ClusterCoordinator:${options.replicaId}] ${msg} ${JSON.stringify(meta)}`
            : `[ClusterCoordinator:${options.replicaId}] ${msg}`;
          const fn =
            lvl === "error" ? "error" : lvl === "warn" ? "warn" : "log";

          console[fn](line);
        }),
    };
  }

  /** Register self, ensure an assignment exists, return our shards. */
  public async join(): Promise<JoinResult> {
    await this.heartbeat();
    await this.reconcileAssignment(/* force*/ false);
    await this.opts.subscriber.subscribe(
      rebalanceChannel(this.opts.clusterName),
    );
    if (!this.messageListener) {
      this.messageListener = (ch, payload) => {
        if (ch !== rebalanceChannel(this.opts.clusterName)) return;
        const epoch = Number(payload);
        if (!Number.isFinite(epoch) || epoch <= this.currentEpoch) return;
        this.applyAssignmentFromRedis().catch((err) =>
          this.opts.log("warn", "rebalance apply failed", { err: String(err) }),
        );
      };
      this.opts.subscriber.on("message", this.messageListener);
    }
    this.heartbeatTimer = setInterval(() => {
      this.tick().catch((err) =>
        this.opts.log("warn", "heartbeat tick failed", { err: String(err) }),
      );
    }, this.opts.heartbeatIntervalMs);
    const assignment = await this.readAssignment();
    return {
      shards: this.currentShards,
      epoch: this.currentEpoch,
      assignment: assignment ?? this.fallbackSoloAssignment(),
    };
  }

  public onRebalance(fn: RebalanceListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Current shard ids owned by this replica. */
  public getShards(): readonly number[] {
    return this.currentShards;
  }

  public async leave(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.messageListener) {
      if (typeof this.opts.subscriber.off === "function") {
        this.opts.subscriber.off("message", this.messageListener);
      } else if (
        typeof (
          this.opts.subscriber as unknown as {
            removeListener?: (...args: unknown[]) => unknown;
          }
        ).removeListener === "function"
      ) {
        (
          this.opts.subscriber as unknown as {
            removeListener: (...args: unknown[]) => unknown;
          }
        ).removeListener("message", this.messageListener);
      }
      this.messageListener = null;
    }
    try {
      await this.opts.redis.zrem(
        membersKey(this.opts.clusterName),
        this.opts.replicaId,
      );
      await this.opts.subscriber.unsubscribe(
        rebalanceChannel(this.opts.clusterName),
      );
      await this.reconcileAssignment(true);
    } catch {
      /* swallow - best effort on shutdown */
    }
  }

  private async tick(): Promise<void> {
    if (this.closed) return;
    await this.heartbeat();
    await this.reconcileAssignment(/* force*/ false);
  }

  private async heartbeat(): Promise<void> {
    const now = Date.now();
    const cutoff = now - this.opts.memberTtlMs;
    await this.opts.redis
      .multi()
      .zadd(membersKey(this.opts.clusterName), now, this.opts.replicaId)
      .zremrangebyscore(membersKey(this.opts.clusterName), "-inf", cutoff)
      .exec();
  }

  private async reconcileAssignment(force: boolean): Promise<void> {
    const liveIds = await this.opts.redis.zrange(
      membersKey(this.opts.clusterName),
      0,
      -1,
    );
    let current = await this.readAssignment();
    const wantByReplica = assignShards(liveIds, this.opts.shardCount);
    const needsRewrite =
      force ||
      !current ||
      current.shardCount !== this.opts.shardCount ||
      !sameAssignment(current.byReplica, wantByReplica);

    if (!needsRewrite) {
      if (current && current.epoch !== this.currentEpoch) {
        await this.applyAssignmentFromRedis();
      }
      return;
    }

    const gotLock = await this.tryAcquireLeaderLock();
    if (!gotLock) {
      // Another replica will rewrite; just sync to whatever lands.
      if (current && current.epoch !== this.currentEpoch) {
        await this.applyAssignmentFromRedis();
      }
      return;
    }

    const { raw: currentRaw, value: reread } = await this.readAssignmentRaw();
    current = reread;
    if (
      current &&
      current.shardCount === this.opts.shardCount &&
      sameAssignment(current.byReplica, wantByReplica)
    ) {
      if (current.epoch !== this.currentEpoch) {
        await this.applyAssignmentFromRedis();
      }
      return;
    }

    const nextEpoch = (current?.epoch ?? 0) + 1;
    const next: ClusterAssignment = {
      epoch: nextEpoch,
      shardCount: this.opts.shardCount,
      byReplica: wantByReplica,
      writtenAt: Date.now(),
    };
    // The leader lock can expire mid-reconcile (short TTL, no renewal), so two
    // replicas can both believe they are leader. Writing unconditionally would
    // let the loser's stale member snapshot overwrite the winner's assignment
    // at the same epoch - two replicas owning the same shard. Swap in the new
    // value only if the assignment key still holds exactly what we read.
    const swapped = await this.opts.redis.eval(
      CAS_ASSIGNMENT_SCRIPT,
      1,
      assignmentKey(this.opts.clusterName),
      currentRaw ?? "",
      JSON.stringify(next),
    );
    if (swapped !== 1) {
      this.opts.log("warn", "assignment changed under us; resyncing", {
        attemptedEpoch: nextEpoch,
      });
      await this.applyAssignmentFromRedis();
      return;
    }
    await this.opts.redis.publish(
      rebalanceChannel(this.opts.clusterName),
      String(nextEpoch),
    );
    this.opts.log("info", "wrote new assignment", {
      epoch: nextEpoch,
      replicas: liveIds.length,
      shardCount: this.opts.shardCount,
    });
    // Apply locally (we are part of `liveIds`).
    await this.applyAssignment(next);
  }

  private async tryAcquireLeaderLock(): Promise<boolean> {
    const ok = await this.opts.redis.set(
      leaderLockKey(this.opts.clusterName),
      this.opts.replicaId,
      "PX",
      this.opts.leaderLockTtlMs,
      "NX",
    );
    return ok === "OK";
  }

  private async readAssignment(): Promise<ClusterAssignment | null> {
    return (await this.readAssignmentRaw()).value;
  }

  private async readAssignmentRaw(): Promise<{
    raw: string | null;
    value: ClusterAssignment | null;
  }> {
    const raw = await this.opts.redis.get(assignmentKey(this.opts.clusterName));
    if (!raw) return { raw: null, value: null };
    return {
      raw,
      value: (tryParseJSON(raw) as ClusterAssignment | null) ?? null,
    };
  }

  private async applyAssignmentFromRedis(): Promise<void> {
    const a = await this.readAssignment();
    if (!a) return;
    await this.applyAssignment(a);
  }

  /**
   * Serialized: the pub/sub rebalance handler and the heartbeat tick can both
   * land an apply, and listeners spawn/destroy gateway shards - overlapping
   * runs would issue add/remove for the same shard id concurrently.
   */
  private applyAssignment(a: ClusterAssignment): Promise<void> {
    const run = this.applyChain.then(
      () => this.doApplyAssignment(a),
      () => this.doApplyAssignment(a),
    );
    this.applyChain = run.catch(() => undefined);
    return run;
  }

  private async doApplyAssignment(a: ClusterAssignment): Promise<void> {
    if (a.epoch < this.currentEpoch) return;
    const next = (a.byReplica[this.opts.replicaId] ?? [])
      .slice()
      .sort((x, y) => x - y);
    const delta = diff(this.currentShards, next);
    this.currentShards = next;
    this.currentEpoch = a.epoch;
    if (delta.added.length === 0 && delta.removed.length === 0) {
      return; // no-op for this replica
    }
    this.opts.log("info", "shard assignment changed", {
      epoch: a.epoch,
      added: delta.added,
      removed: delta.removed,
      owned: next.length,
    });
    for (const fn of this.listeners) {
      try {
        await fn(delta, a);
      } catch (err) {
        this.opts.log("error", "rebalance listener threw", {
          err: String(err),
        });
      }
    }
  }

  /** Used when no assignment has ever been written and we're solo. */
  private fallbackSoloAssignment(): ClusterAssignment {
    const all = Array.from({ length: this.opts.shardCount }, (_, i) => i);
    return {
      epoch: 0,
      shardCount: this.opts.shardCount,
      byReplica: { [this.opts.replicaId]: all },
      writtenAt: Date.now(),
    };
  }
}

function sameAssignment(
  a: Record<string, number[]>,
  b: Record<string, number[]>,
): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
  for (const k of ka) {
    const av = a[k]!;
    const bv = b[k]!;
    if (av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
  }
  return true;
}
