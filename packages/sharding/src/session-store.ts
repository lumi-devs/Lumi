// Session resumption. `@discordjs/ws` calls `retrieveSessionInfo(shardId)` before
// opening each shard; returning a recent `SessionInfo` makes the gateway RESUME
// instead of IDENTIFY (no budget consumed, missed dispatches replayed, near-free
// shard handoff). We persist SessionInfo to shared Redis keyed by shardId so a
// restarted process — or a replica taking over a shard — resumes the prior session.
//
// TTL defaults to 5 minutes: Discord invalidates sessions disconnected for "a few
// minutes", after which RESUME fails 4007/4009 and the shard falls back to IDENTIFY.
// `updateSessionInfo` fires after every dispatch, so writes are coalesced (flush
// every `flushIntervalMs`, default 1s) with a synchronous flush on shutdown.

import type { Redis } from "ioredis";
import type { SessionInfo } from "@discordjs/ws";

export interface RedisSessionStoreOptions {
  redis: Redis;
  clusterName: string;
  /** Session info TTL (seconds). Default 300. */
  ttlSeconds?: number;
  /** Flush coalescing window (ms). Default 1_000. */
  flushIntervalMs?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
}

const sessionKey = (cluster: string, shardId: number) =>
  `lumi:cluster:${cluster}:session:${shardId}`;

export class RedisSessionStore {
  private readonly opts: Required<Omit<RedisSessionStoreOptions, "log">> & {
    log: NonNullable<RedisSessionStoreOptions["log"]>;
  };

  private readonly pending = new Map<number, SessionInfo | null>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  public constructor(options: RedisSessionStoreOptions) {
    this.opts = {
      redis: options.redis,
      clusterName: options.clusterName,
      ttlSeconds: options.ttlSeconds ?? 300,
      flushIntervalMs: options.flushIntervalMs ?? 1_000,
      log:
        options.log ??
        ((lvl, msg, meta) => {
          const line = meta
            ? `[SessionStore] ${msg} ${JSON.stringify(meta)}`
            : `[SessionStore] ${msg}`;
          const fn =
            lvl === "error" ? "error" : lvl === "warn" ? "warn" : "log";

          console[fn](line);
        }),
    };
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) =>
        this.opts.log("warn", "session flush failed", { err: String(err) }),
      );
    }, this.opts.flushIntervalMs);
  }

  public async retrieve(shardId: number): Promise<SessionInfo | null> {
    if (this.pending.has(shardId)) return this.pending.get(shardId) ?? null;
    const raw = await this.opts.redis.get(
      sessionKey(this.opts.clusterName, shardId),
    );
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionInfo;
    } catch {
      return null;
    }
  }

  public update(shardId: number, info: SessionInfo | null): void {
    this.pending.set(shardId, info);
  }

  /** Drop persisted session for a shard we're handing off as invalidated. */
  public async invalidate(shardId: number): Promise<void> {
    this.pending.delete(shardId);
    await this.opts.redis.del(sessionKey(this.opts.clusterName, shardId));
  }

  public async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const snapshot = Array.from(this.pending.entries());
    this.pending.clear();
    const pipe = this.opts.redis.multi();
    for (const [shardId, info] of snapshot) {
      const key = sessionKey(this.opts.clusterName, shardId);
      if (info === null) {
        pipe.del(key);
      } else {
        pipe.set(key, JSON.stringify(info), "EX", this.opts.ttlSeconds);
      }
    }
    await pipe.exec();
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    try {
      await this.flush();
    } catch (err) {
      this.opts.log("warn", "final session flush failed", {
        err: String(err),
      });
    }
  }
}
