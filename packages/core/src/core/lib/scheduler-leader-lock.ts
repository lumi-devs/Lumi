// Single-active-scheduler leader election via Redis SET NX EX.
//
// Multiple `scheduler` replicas can run for HA; only the holder of
// `ember:scheduler:leader` actually owns the BullMQ Queue + Worker
// initialisation path. Followers block on `acquire()` until the leader's
// key TTL lapses, then take over.
//
// Loss-of-leadership semantics: while the leader is alive it renews the
// key every `renewIntervalMs` (well under the TTL). If a renewal fails or
// returns "no longer the holder" — network partition, manual DEL,
// Sentinel failover that dropped the key — we invoke `onLost` so the
// caller can exit the process. The orchestrator restarts it and it
// re-enters the polling loop from `acquire()`.
//
// Why a custom lock rather than BullMQ's own job locks? BullMQ already
// serialises job *execution* across multiple Workers via per-job Redis
// locks, so duplicate fires are not possible. But running multiple
// schedulers means multiple bull `Worker`s reading from the same queues,
// multiple repeat-job evaluators, and multiple SchedulerRequestConsumers
// translating `create()` calls — all harmless functionally but wasteful.
// The leader lock collapses that to one active replica with the others
// hot-standby. Set `SCHEDULER_LEADER_LOCK=true` to enable; default is
// off (rely on BullMQ job locks).

import type { Redis } from "ioredis";
import { RedisKeys } from "#database/redis.js";

export interface SchedulerLeaderLockOptions {
  redis: Redis;
  /** Unique identifier for this replica — written as the lock's value. */
  replicaId: string;
  /** Lock TTL (ms). Defaults to 30s. */
  ttlMs?: number;
  /** Renewal cadence (ms). Defaults to ttlMs / 3 = 10s. */
  renewIntervalMs?: number;
  /** Polling cadence while waiting to acquire (ms). Defaults to 2s. */
  pollIntervalMs?: number;
  /** Callback fired when leadership is lost involuntarily. */
  onLost: (reason: string) => void;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

export class SchedulerLeaderLock {
  private readonly redis: Redis;
  private readonly key = RedisKeys.schedulerLeader();
  private readonly replicaId: string;
  private readonly ttlMs: number;
  private readonly renewIntervalMs: number;
  private readonly pollIntervalMs: number;
  private readonly onLost: (reason: string) => void;
  private readonly log: NonNullable<SchedulerLeaderLockOptions["log"]>;

  private renewTimer: ReturnType<typeof setInterval> | null = null;
  private released = false;
  private state: "idle" | "waiting" | "leader" = "idle";

  public constructor(opts: SchedulerLeaderLockOptions) {
    this.redis = opts.redis;
    this.replicaId = opts.replicaId;
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.renewIntervalMs = opts.renewIntervalMs ?? Math.floor(this.ttlMs / 3);
    this.pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    this.onLost = opts.onLost;
    this.log = opts.log ?? (() => {});
  }

  public isLeader(): boolean {
    return this.state === "leader";
  }

  /** Block until this replica wins the lock. Resolves once it's leader. */
  public async acquire(): Promise<void> {
    this.state = "waiting";
    let warned = false;
    while (!this.released) {
      const ok = await this.redis.set(
        this.key,
        this.replicaId,
        "PX",
        this.ttlMs,
        "NX",
      );
      if (ok === "OK") {
        this.state = "leader";
        this.log("info", "[SchedulerLock] Acquired leadership", {
          replicaId: this.replicaId,
        });
        this.startRenewal();
        return;
      }
      if (!warned) {
        const holder = await this.redis.get(this.key).catch(() => null);
        this.log("info", "[SchedulerLock] Waiting for leadership", {
          holder: holder ?? "unknown",
        });
        warned = true;
      }
      await sleep(this.pollIntervalMs);
    }
  }

  /** Release the lock on graceful shutdown. Safe to call when not leader. */
  public async release(): Promise<void> {
    this.released = true;
    this.stopRenewal();
    if (this.state !== "leader") return;
    this.state = "idle";
    try {
      await this.redis.eval(
        `if redis.call("GET", KEYS[1]) == ARGV[1] then
           return redis.call("DEL", KEYS[1])
         else
           return 0
         end`,
        1,
        this.key,
        this.replicaId,
      );
    } catch (err: unknown) {
      this.log("warn", "[SchedulerLock] Release error (ignored)", {
        err: String(err),
      });
    }
  }

  private startRenewal(): void {
    this.renewTimer = setInterval(() => {
      void this.renew();
    }, this.renewIntervalMs);
  }

  private async renew(): Promise<void> {
    try {
      // Compare-and-swap renewal: only extend TTL if we still hold the key.
      // Lua keeps the GET + PEXPIRE atomic so a takeover between commands
      // can't fool us into renewing someone else's lock.
      const result = (await this.redis.eval(
        `if redis.call("GET", KEYS[1]) == ARGV[1] then
           return redis.call("PEXPIRE", KEYS[1], ARGV[2])
         else
           return 0
         end`,
        1,
        this.key,
        this.replicaId,
        this.ttlMs.toString(),
      )) as number;
      if (result !== 1) {
        this.handleLost("renewal returned 0 — lock taken by another replica");
      }
    } catch (err: unknown) {
      this.log("error", "[SchedulerLock] Renewal error", { err: String(err) });
      this.handleLost(`renewal threw: ${String(err)}`);
    }
  }

  private handleLost(reason: string): void {
    if (this.state !== "leader") return;
    this.state = "idle";
    this.stopRenewal();
    this.log("error", "[SchedulerLock] Lost leadership", { reason });
    this.onLost(reason);
  }

  private stopRenewal(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
