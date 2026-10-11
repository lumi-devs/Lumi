import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { AsyncQueue } from "@sapphire/async-queue";
import { container } from "#src/lib/Services.js";
import type { WorkerRequest, WorkerResponse } from "#src/lib/regex-worker/Protocol.js";

const DefaultEvalTimeoutMs = 250;

const DefaultProbeTimeoutMs = 250;

const DefaultMatchTimeoutMs = 1_000;

export const MatchBatchSize = 100;

const MaxSpawnFailures = 3;

const ReadyTimeoutMs = 10_000;

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

  lastIndex: number | null;
}

export interface RegexWorkerOptions {
  evalTimeoutMs?: number;
  probeTimeoutMs?: number;
  matchTimeoutMs?: number;
}

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

  #ready: Promise<boolean> | null = null;
  #markReady: ((ok: boolean) => void) | null = null;

  public constructor(options: RegexWorkerOptions = {}) {
    this.#evalTimeoutMs = options.evalTimeoutMs ?? DefaultEvalTimeoutMs;
    this.#probeTimeoutMs = options.probeTimeoutMs ?? DefaultProbeTimeoutMs;
    this.#matchTimeoutMs = options.matchTimeoutMs ?? DefaultMatchTimeoutMs;
  }

  public get available(): boolean {
    return this.#spawnFailures < MaxSpawnFailures;
  }

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

function resolveWorkerEntry(): URL | null {
  const base = new URL("./Worker", import.meta.url).href;
  for (const candidate of [`${base}.ts`, `${base}.js`]) {
    const url = new URL(candidate);
    if (existsSync(fileURLToPath(url))) return url;
  }
  return null;
}

let shared: RegexWorkerHandler | null = null;
let probeShared: RegexWorkerHandler | null = null;

export function getRegexWorker(): RegexWorkerHandler {
  shared ??= new RegexWorkerHandler();
  return shared;
}

export function getRegexProbeWorker(): RegexWorkerHandler {
  probeShared ??= new RegexWorkerHandler();
  return probeShared;
}

export async function shutdownRegexWorker(): Promise<void> {
  const handler = shared;
  const probe = probeShared;
  shared = null;
  probeShared = null;
  await handler?.destroy();
  await probe?.destroy();
}
