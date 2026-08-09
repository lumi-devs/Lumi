import type { Redis } from "ioredis";
import { RedisKeys } from "#lib/database/redis.js";
import { REDIS_RELEASE_SCRIPT, REDIS_EXTEND_SCRIPT } from "#lib/redis-lock.js";

export interface CommandRegistrationLockOptions {
  redis: Redis;
  /** Unique identifier for this replica - written as the lock's value. */
  replicaId: string;
  /** Lock TTL (ms). Defaults to 30s. */
  ttlMs?: number;
  /** Renewal cadence (ms). Defaults to ttlMs / 3 = 10s. */
  renewIntervalMs?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

/**
 * Single-winner lock around the Discord-facing application command
 * registration. Mirrors {@link SchedulerLeaderLock}'s `SET NX PX` primitive,
 * but never blocks: replicas that lose the race simply skip the network
 * registration and keep loading their command pieces for local dispatch.
 */
export class CommandRegistrationLock {
  private readonly redis: Redis;
  private readonly key = RedisKeys.commandRegistrationLeader();
  private readonly replicaId: string;
  private readonly ttlMs: number;
  private readonly renewIntervalMs: number;
  private readonly log: NonNullable<CommandRegistrationLockOptions["log"]>;

  private renewTimer: ReturnType<typeof setInterval> | null = null;
  private leader = false;

  public constructor(opts: CommandRegistrationLockOptions) {
    this.redis = opts.redis;
    this.replicaId = opts.replicaId;
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.renewIntervalMs = opts.renewIntervalMs ?? Math.floor(this.ttlMs / 3);
    this.log = opts.log ?? (() => {});
  }

  public isLeader(): boolean {
    return this.leader;
  }

  /** Try once to win the lock. Resolves to whether this replica may register. */
  public async tryAcquire(): Promise<boolean> {
    const ok = await this.redis.set(
      this.key,
      this.replicaId,
      "PX",
      this.ttlMs,
      "NX",
    );
    if (ok !== "OK") {
      const holder = await this.redis.get(this.key).catch(() => null);
      this.log("info", "[CommandLock] Registration held by another replica", {
        holder: holder ?? "unknown",
      });
      return false;
    }
    this.leader = true;
    this.log("info", "[CommandLock] Acquired registration leadership", {
      replicaId: this.replicaId,
    });
    this.startRenewal();
    return true;
  }

  /** Release the lock on graceful shutdown. Safe to call when not leader. */
  public async release(): Promise<void> {
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
      this.log("warn", "[CommandLock] Release error (ignored)", {
        err: String(err),
      });
    }
  }

  private startRenewal(): void {
    this.renewTimer = setInterval(() => {
      void this.renew();
    }, this.renewIntervalMs);
    this.renewTimer.unref?.();
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
        this.leader = false;
        this.stopRenewal();
        this.log("warn", "[CommandLock] Lost registration leadership", {
          reason: "renewal returned 0 - lock taken by another replica",
        });
      }
    } catch (err: unknown) {
      this.leader = false;
      this.stopRenewal();
      this.log("error", "[CommandLock] Renewal error - marking as non-leader", { err: String(err) });
    }
  }

  private stopRenewal(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }
}
