import type { Redis } from "ioredis";
import { REDIS_RELEASE_SCRIPT, REDIS_EXTEND_SCRIPT } from "#lib/redis-lock.js";

export interface LeaderLockOptions {
  redis: Redis;
  /** Redis key this lock contends for. */
  key: string;
  /** Unique identifier for this replica - written as the lock's value. */
  replicaId: string;
  /** Lock TTL (ms). Defaults to 30s. */
  ttlMs?: number;
  /** Renewal cadence (ms). Defaults to ttlMs / 3 = 10s. */
  renewIntervalMs?: number;
  /** Polling cadence while blocked in {@link LeaderLock.acquire}. Defaults to 2s. */
  pollIntervalMs?: number;
  /**
   * Let the renewal timer hold the event loop open (Node/Bun `unref()` is
   * skipped). The scheduler needs this — its whole job is staying alive as
   * long as it's leader. Command registration doesn't; it's a one-shot
   * contest during boot, not a reason to keep the process running.
   */
  keepAlive?: boolean;
  /** Callback fired when leadership is lost involuntarily (renewal failed or was stolen). */
  onLost?: (reason: string) => void;
  /** Prefixes every log line, e.g. "[SchedulerLock]". */
  logPrefix?: string;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

/**
 * Single-winner `SET NX PX` Redis lock with self-renewal, in either of two
 * modes: {@link tryAcquire} (non-blocking - contend once, move on if lost)
 * or {@link acquire} (blocking - poll until this replica wins). Shared by
 * command-registration leadership (non-blocking) and scheduler leadership
 * (blocking, with an `onLost` callback since losing it mid-run is fatal).
 */
export class LeaderLock {
  private readonly redis: Redis;
  private readonly key: string;
  private readonly replicaId: string;
  private readonly ttlMs: number;
  private readonly renewIntervalMs: number;
  private readonly pollIntervalMs: number;
  private readonly keepAlive: boolean;
  private readonly onLost: (reason: string) => void;
  private readonly logPrefix: string;
  private readonly log: NonNullable<LeaderLockOptions["log"]>;

  private renewTimer: ReturnType<typeof setInterval> | null = null;
  private leader = false;
  private released = false;

  public constructor(opts: LeaderLockOptions) {
    this.redis = opts.redis;
    this.key = opts.key;
    this.replicaId = opts.replicaId;
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.renewIntervalMs = opts.renewIntervalMs ?? Math.floor(this.ttlMs / 3);
    this.pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    this.keepAlive = opts.keepAlive ?? false;
    this.onLost = opts.onLost ?? (() => {});
    this.logPrefix = opts.logPrefix ?? "[LeaderLock]";
    this.log = opts.log ?? (() => {});
  }

  public isLeader(): boolean {
    return this.leader;
  }

  /** Try once to win the lock. Resolves to whether this replica may proceed. */
  public async tryAcquire(): Promise<boolean> {
    return this.attempt();
  }

  /** Block until this replica wins the lock. Resolves once it's leader. */
  public async acquire(): Promise<void> {
    let warned = false;
    while (!this.released) {
      if (await this.attempt()) return;
      if (!warned) {
        const holder = await this.redis.get(this.key).catch(() => null);
        this.log("info", `${this.logPrefix} Waiting for leadership`, {
          holder: holder ?? "unknown",
        });
        warned = true;
      }
      await sleep(this.pollIntervalMs);
    }
  }

  private async attempt(): Promise<boolean> {
    const ok = await this.redis.set(
      this.key,
      this.replicaId,
      "PX",
      this.ttlMs,
      "NX",
    );
    if (ok !== "OK") {
      return false;
    }
    this.leader = true;
    this.log("info", `${this.logPrefix} Acquired leadership`, {
      replicaId: this.replicaId,
    });
    this.startRenewal();
    return true;
  }

  /** Release the lock on graceful shutdown. Safe to call when not leader. */
  public async release(): Promise<void> {
    this.released = true;
    this.stopRenewal();
    if (!this.leader) return;
    this.leader = false;
    try {
      await this.redis.eval(
        REDIS_RELEASE_SCRIPT,
        1,
        this.key,
        this.replicaId,
      );
    } catch (err: unknown) {
      this.log("warn", `${this.logPrefix} Release error (ignored)`, {
        err: String(err),
      });
    }
  }

  private startRenewal(): void {
    this.renewTimer = setInterval(() => {
      void this.renew();
    }, this.renewIntervalMs);
    if (!this.keepAlive) this.renewTimer.unref?.();
  }

  private async renew(): Promise<void> {
    try {
      const result = (await this.redis.eval(
        REDIS_EXTEND_SCRIPT,
        1,
        this.key,
        this.replicaId,
        this.ttlMs.toString(),
      )) as number;
      if (result !== 1) {
        this.handleLost("renewal returned 0 - lock taken by another replica");
      }
    } catch (err: unknown) {
      this.log("error", `${this.logPrefix} Renewal error`, { err: String(err) });
      this.handleLost(`renewal threw: ${String(err)}`);
    }
  }

  private handleLost(reason: string): void {
    if (!this.leader) return;
    this.leader = false;
    this.stopRenewal();
    this.log("error", `${this.logPrefix} Lost leadership`, { reason });
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
