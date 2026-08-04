// Session resumption. `@discordjs/ws` calls `retrieveSessionInfo(shardId)` before
// opening each shard; returning a recent `SessionInfo` makes the gateway RESUME
// instead of IDENTIFY (no budget consumed, missed dispatches replayed, near-free
// shard handoff). We persist SessionInfo to shared Redis keyed by shardId so a
// restarted process - or a replica taking over a shard - resumes the prior session.
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
  // Snapshot of entries a flush() is currently writing to Redis, keyed the
  // same as `pending`. A shardId lives here from the moment its snapshot is
  // taken out of `pending` until its write is confirmed committed (pipeline
  // `exec()` resolved) - see `retrieve()` and `flush()`.
  private readonly inFlight = new Map<number, SessionInfo | null>();
  // Serializes flush() bodies so overlapping calls (e.g. the interval timer
  // firing again before a slow Redis round-trip finishes, or close() racing
  // that timer) never take concurrent snapshots of `pending`/`inFlight` for
  // the same shardId - see `flush()`.
  private flushPromise: Promise<void> | null = null;
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
    // A flush that already snapshotted-and-cleared this shardId out of
    // `pending` may still be waiting on its Redis pipeline to land. Prefer
    // that in-flight value over Redis instead of falling through to a GET
    // that can race the still-in-transit write and return stale/absent
    // data (the bug: without this, retrieve() would see `pending` empty
    // and read Redis before the pipeline it's racing has actually
    // committed).
    if (this.inFlight.has(shardId)) return this.inFlight.get(shardId) ?? null;
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

  /**
   * Writes pending session updates to Redis. Only one flush body runs at a
   * time: if a flush is already in progress, this call waits for it and
   * then re-runs to pick up whatever accumulated in `pending` meanwhile,
   * rather than taking an overlapping snapshot that could stomp on the
   * in-progress one's `inFlight` bookkeeping for the same shardId.
   */
  public flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise.then(
        () => this.flush(),
        () => this.flush(),
      );
    }
    if (this.pending.size === 0) return Promise.resolve();
    const run = this.doFlush();
    this.flushPromise = run;
    return run.finally(() => {
      if (this.flushPromise === run) this.flushPromise = null;
    });
  }

  private async doFlush(): Promise<void> {
    const snapshot = Array.from(this.pending.entries());
    // Populate `inFlight` *before* clearing `pending` (both run
    // synchronously here, with no `await` between them, so no other code
    // can interleave) so a concurrent retrieve() for one of these shardIds
    // always finds the value in one map or the other - never neither.
    for (const [shardId, info] of snapshot) this.inFlight.set(shardId, info);
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
    try {
      await pipe.exec();
      // Committed: Redis now reflects these values, so retrieve() can go
      // back to reading through it.
      for (const [shardId] of snapshot) this.inFlight.delete(shardId);
    } catch (err) {
      for (const [shardId, info] of snapshot) {
        this.inFlight.delete(shardId);
        if (!this.pending.has(shardId)) this.pending.set(shardId, info);
      }
      throw err;
    }
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
