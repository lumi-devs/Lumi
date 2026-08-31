import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { AsyncQueue } from "@sapphire/async-queue";
import { container } from "@sapphire/framework";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

/**
 * Wall-clock budget for one evaluation before the worker is presumed hung.
 * Generous on purpose: blowing it disables a guild's rule, so the cost of a
 * false positive under CPU contention is higher than the cost of waiting.
 * Nothing on the event loop is blocked meanwhile - only this message's filtering
 * is delayed.
 */
export const DefaultEvalTimeoutMs = 250;

/** Budget for a save-time probe, which runs a pattern against nasty inputs. */
export const DefaultProbeTimeoutMs = 250;

/**
 * Budget for one bulk match batch. Larger than a single evaluation because a
 * batch covers a whole page of messages, but still bounded so a pattern that
 * only misbehaves on real content cannot pin the worker.
 */
export const DefaultMatchTimeoutMs = 1_000;

/** Contents per bulk match request; keeps one batch inside one budget. */
export const MatchBatchSize = 100;

/** Consecutive spawn failures after which the handler stops trying. */
const MaxSpawnFailures = 3;

/** How long a freshly spawned worker has to announce itself. */
const ReadyTimeoutMs = 10_000;

/**
 * An evaluation exceeded its budget. `patternIndex` is the pattern the worker
 * had started when the clock ran out - the one to disable.
 */
export class RegexTimeoutError extends Error {
  public constructor(public readonly patternIndex: number | null) {
    super(
      patternIndex === null
        ? "Regex evaluation timed out"
        : `Regex evaluation timed out on pattern #${patternIndex}`,
    );
    this.name = "RegexTimeoutError";
  }
}

/**
 * The worker could not be spawned or warmed (see {@link RegexWorkerHandler.available}).
 * Thrown rather than returned so callers can't mistake an outage for "no match".
 */
export class RegexWorkerUnavailableError extends Error {
  public constructor() {
    super("Regex worker is unavailable");
    this.name = "RegexWorkerUnavailableError";
  }
}

type RequestResult = number | null | number[];

interface Pending {
  id: number;
  resolve(value: RequestResult): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
  /** Last pattern the worker announced it was about to run. */
  lastIndex: number | null;
}

export interface RegexWorkerOptions {
  evalTimeoutMs?: number;
  probeTimeoutMs?: number;
  matchTimeoutMs?: number;
}

/**
 * Owns a single regex worker thread and serializes requests onto it.
 *
 * Modelled on Skyra's `src/lib/moderation/workers/`: an `AsyncQueue` for
 * serialization, correlation-ID matching, a hard timeout per evaluation, and a
 * restart on failure. Serializing means a hung pattern costs one timeout
 * window of filter latency rather than corrupting other in-flight requests.
 *
 * The worker is `unref`'d, so it never holds the process open.
 */
export class RegexWorkerHandler {
  readonly #queue = new AsyncQueue();
  readonly #loaded = new Set<string>();
  readonly #evalTimeoutMs: number;
  readonly #probeTimeoutMs: number;
  readonly #matchTimeoutMs: number;

  #worker: Worker | null = null;
  #pending: Pending | null = null;
  #nextId = 0;
  #spawnFailures = 0;
  /** Resolves once the current worker has announced itself. */
  #ready: Promise<boolean> | null = null;
  #markReady: ((ok: boolean) => void) | null = null;

  public constructor(options: RegexWorkerOptions = {}) {
    this.#evalTimeoutMs = options.evalTimeoutMs ?? DefaultEvalTimeoutMs;
    this.#probeTimeoutMs = options.probeTimeoutMs ?? DefaultProbeTimeoutMs;
    this.#matchTimeoutMs = options.matchTimeoutMs ?? DefaultMatchTimeoutMs;
  }

  /** False once the worker has failed to spawn too often; callers skip regex rules. */
  public get available(): boolean {
    return this.#spawnFailures < MaxSpawnFailures;
  }

  /**
   * Index of the first pattern in `patterns` that matches `content`, or null.
   * Patterns are shipped once per `key` and referenced by key thereafter, so the
   * per-message payload stays just the content.
   *
   * @throws {RegexTimeoutError} when evaluation exceeds the budget.
   */
  public async test(
    key: string,
    patterns: string[],
    content: string,
  ): Promise<number | null> {
    if (patterns.length === 0) return null;
    await this.#queue.wait();
    try {
      const worker = await this.#warmWorker();
      if (!worker) throw new RegexWorkerUnavailableError();

      if (!this.#loaded.has(key)) {
        worker.postMessage({ kind: "load", key, patterns } satisfies WorkerRequest);
        this.#loaded.add(key);
      }

      const id = ++this.#nextId;
      const index = await this.#request(
        worker,
        { kind: "test", id, key, content },
        this.#evalTimeoutMs,
      );
      return Array.isArray(index) ? null : index;
    } finally {
      this.#queue.shift();
    }
  }

  /**
   * Run `pattern` against `inputs` under the probe budget. Returns false when it
   * blew the budget - i.e. the pattern backtracks catastrophically and must be
   * rejected. Returns true when the worker is unavailable: a pattern that can
   * never run is a pattern that can never hang.
   */
  public async probe(pattern: string, inputs: string[]): Promise<boolean> {
    await this.#queue.wait();
    try {
      const worker = await this.#warmWorker();
      if (!worker) return true;

      const id = ++this.#nextId;
      await this.#request(
        worker,
        { kind: "probe", id, pattern, inputs },
        this.#probeTimeoutMs,
      );
      return true;
    } catch (err) {
      if (err instanceof RegexTimeoutError) return false;
      throw err;
    } finally {
      this.#queue.shift();
    }
  }

  /**
   * Positions in `contents` matched by `pattern`, evaluated inside the worker
   * under {@link DefaultMatchTimeoutMs}. Callers with more than
   * {@link MatchBatchSize} items should batch, so one hostile pattern costs
   * one budget window rather than pinning the worker for the whole scan.
   *
   * Returns null when the worker is unavailable, so callers can fail closed
   * rather than silently falling back to the event loop.
   *
   * @throws {RegexTimeoutError} when the batch exceeds its budget.
   */
  public async matchAll(
    pattern: string,
    contents: string[],
  ): Promise<number[] | null> {
    if (contents.length === 0) return [];
    await this.#queue.wait();
    try {
      const worker = await this.#warmWorker();
      if (!worker) return null;

      const id = ++this.#nextId;
      const result = await this.#request(
        worker,
        { kind: "matchAll", id, pattern, contents },
        this.#matchTimeoutMs,
      );
      return Array.isArray(result) ? result : [];
    } finally {
      this.#queue.shift();
    }
  }

  /** Terminate the worker; the next request spawns a fresh one. */
  public async destroy(): Promise<void> {
    const worker = this.#worker;
    this.#teardown(new Error("Regex worker destroyed"));
    await worker?.terminate();
  }

  #request(
    worker: Worker,
    message: WorkerRequest & { id: number },
    timeoutMs: number,
  ): Promise<RequestResult> {
    return new Promise<RequestResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Detach first: #restart rejects whatever is still pending, and this
        // request must surface as a timeout, not as a generic restart error.
        const pending = this.#pending;
        const lastIndex = pending?.lastIndex ?? null;
        if (pending) {
          clearTimeout(pending.timer);
          this.#pending = null;
        }
        this.#restart(`evaluation exceeded ${timeoutMs}ms`);
        reject(new RegexTimeoutError(lastIndex));
      }, timeoutMs);
      timer.unref?.();

      this.#pending = { id: message.id, resolve, reject, timer, lastIndex: null };
      worker.postMessage(message);
    });
  }

  /**
   * Spawn the worker if needed and wait for it to come up. Startup costs
   * hundreds of milliseconds, so it is deliberately outside the evaluation
   * budget - otherwise every restart would cascade into another timeout.
   */
  async #warmWorker(): Promise<Worker | null> {
    const worker = this.#ensureWorker();
    if (!worker) return null;

    const ready = await Promise.race([
      this.#ready ?? Promise.resolve(true),
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), ReadyTimeoutMs);
        timer.unref?.();
      }),
    ]);
    if (!ready) {
      this.#spawnFailures++;
      this.#restart("worker never became ready");
      return null;
    }
    return this.#worker === worker ? worker : null;
  }

  #ensureWorker(): Worker | null {
    if (this.#worker) return this.#worker;
    if (!this.available) return null;

    const entry = resolveWorkerEntry();
    if (!entry) {
      this.#spawnFailures = MaxSpawnFailures;
      container.logger?.error(
        "[RegexWorker] Worker entrypoint not found; regex filter rules are disabled.",
      );
      return null;
    }

    try {
      // No `env` override: the worker reads none, and Bun rejects SHARE_ENV.
      const worker = new Worker(entry);
      worker.unref();
      this.#ready = new Promise<boolean>((resolve) => {
        this.#markReady = resolve;
      });
      worker.on("message", (msg: WorkerResponse) => this.#onMessage(msg));
      worker.on("error", (err: Error) => {
        container.logger?.error("[RegexWorker] Worker errored:", err);
        this.#restart("worker error");
      });
      worker.on("exit", (code: number) => {
        if (this.#worker !== worker) return;
        this.#restart(`worker exited (code ${code})`);
      });
      this.#worker = worker;
      this.#spawnFailures = 0;
      return worker;
    } catch (err: unknown) {
      this.#spawnFailures++;
      container.logger?.error(
        `[RegexWorker] Failed to spawn worker (attempt ${this.#spawnFailures}):`,
        err,
      );
      return null;
    }
  }

  #onMessage(msg: WorkerResponse): void {
    if (msg.kind === "ready") {
      this.#markReady?.(true);
      this.#markReady = null;
      return;
    }

    const pending = this.#pending;
    if (!pending || pending.id !== msg.id) return;

    switch (msg.kind) {
      case "progress":
        pending.lastIndex = msg.index;
        return;
      case "result":
        this.#settle(pending, () => pending.resolve(msg.index));
        return;
      case "matches":
        this.#settle(pending, () => pending.resolve(msg.indexes));
        return;
      case "unknown":
        // Worker restarted between load and test; drop the key and pass this
        // message unfiltered rather than stalling the caller.
        this.#loaded.delete(msg.key);
        this.#settle(pending, () => pending.resolve(null));
        return;
    }
  }

  #settle(pending: Pending, finish: () => void): void {
    clearTimeout(pending.timer);
    this.#pending = null;
    finish();
  }

  /** Kill the worker so a hung pattern cannot survive into the next request. */
  #restart(reason: string): void {
    const worker = this.#worker;
    this.#teardown(new Error(`Regex worker restarted: ${reason}`));
    if (worker) {
      container.logger?.warn(`[RegexWorker] Restarting worker: ${reason}`);
      void worker.terminate();
    }
  }

  #teardown(err: Error): void {
    this.#worker = null;
    this.#loaded.clear();
    this.#markReady?.(false);
    this.#markReady = null;
    this.#ready = null;
    const pending = this.#pending;
    if (pending) {
      clearTimeout(pending.timer);
      this.#pending = null;
      pending.reject(err);
    }
  }
}

/**
 * The worker runs from source (Bun executes TypeScript directly), so prefer the
 * `.ts` entry and fall back to `.js` for any compiled deployment.
 */
function resolveWorkerEntry(): URL | null {
  const base = new URL("./worker", import.meta.url).href;
  for (const candidate of [`${base}.ts`, `${base}.js`]) {
    const url = new URL(candidate);
    if (existsSync(fileURLToPath(url))) return url;
  }
  return null;
}

let shared: RegexWorkerHandler | null = null;

/** Process-wide handler; the pool is deliberately one worker until measured. */
export function getRegexWorker(): RegexWorkerHandler {
  shared ??= new RegexWorkerHandler();
  return shared;
}

export async function shutdownRegexWorker(): Promise<void> {
  const handler = shared;
  shared = null;
  await handler?.destroy();
}
