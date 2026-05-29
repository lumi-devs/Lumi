import { container } from "@sapphire/framework";
import { envParseInteger } from "#lib/env.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { snapshotWorkerHandlers } from "./registry.js";
import type { WorkerResponse } from "./types.js";

export { WorkerAction } from "./types.js";
export type { WorkerRequest, WorkerResponse } from "./types.js";
export { registerWorkerHandler, unregisterWorkerHandler } from "./registry.js";

/** Default per-job timeout for worker-thread RPC. */
export const JOB_TIMEOUT_MS = 30_000;

interface WorkerState {
  worker: Worker;
  remaining: number; // in-flight job count
  readyPromise: Promise<void>;
}

interface QueuedJob {
  id: string;
  action: string;
  payload: unknown;
  timeoutMs: number;
  resolve: (res: WorkerResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  workerState?: WorkerState;
}

const INIT_TIMEOUT_MS = 30_000;
const INIT_ACTION = "__INIT__";

export class WorkerManager {
  readonly #workers: WorkerState[] = [];
  readonly #queue: QueuedJob[] = [];
  readonly #pending = new Map<string, QueuedJob>();
  readonly #count: number;
  #spawned = false;

  public constructor(count = envParseInteger("WORKER_COUNT", 2)) {
    this.#count = count;
  }

  public async send<T = unknown>(
    action: string,
    payload: unknown,
    timeoutMs = JOB_TIMEOUT_MS,
  ): Promise<T> {
    this.#ensureSpawned();
    const id = crypto.randomUUID();
    const promise = new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => this.#handleTimeout(id), timeoutMs);
      const job = { id, action, payload, timeoutMs, resolve, reject, timer };
      this.#queue.push(job);
      this.#pending.set(id, job);
    });

    this.#process();
    const res = await promise;
    if (!res.success) throw new Error(res.error ?? "Worker Error");
    return res.data as T;
  }

  public async broadcast<T = unknown>(
    action: string,
    payload: unknown,
    timeoutMs = JOB_TIMEOUT_MS,
  ): Promise<T[]> {
    this.#ensureSpawned();
    return Promise.all(
      this.#workers.map((state) =>
        this.#sendToWorker<T>(state, action, payload, timeoutMs),
      ),
    );
  }

  public async destroy(): Promise<void> {
    await Promise.all(this.#workers.map((w) => w.worker.terminate()));
    for (const j of this.#pending.values()) {
      clearTimeout(j.timer);
      j.reject(new Error("Destroyed"));
    }
    this.#workers.length = 0;
    this.#queue.length = 0;
    this.#pending.clear();
  }

  async #sendToWorker<T>(
    state: WorkerState,
    action: string,
    payload: unknown,
    timeoutMs: number,
  ): Promise<T> {
    await state.readyPromise;
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.#handleTimeout(id), timeoutMs);
      const job: QueuedJob = {
        id,
        action,
        payload,
        timeoutMs,
        resolve: (res) =>
          res.success
            ? resolve(res.data as T)
            : reject(new Error(res.error ?? "Worker Error")),
        reject,
        timer,
        workerState: state,
      };
      this.#pending.set(id, job);
      state.remaining++;
      try {
        state.worker.postMessage({ id, action, payload });
      } catch (err: unknown) {
        clearTimeout(timer);
        this.#pending.delete(id);
        state.remaining = Math.max(0, state.remaining - 1);
        container.logger.error(
          `[WorkerManager] Failed to broadcast to worker:`,
          err,
        );
        reject(new Error("Failed to dispatch job to worker"));
      }
    });
  }

  /**
   * Lazy spawn. We don't open worker threads until the first job because
   * modules register their handlers from `onLoad`; spawning at WorkerManager
   * construction would race that registration window.
   */
  #ensureSpawned() {
    if (this.#spawned) return;
    this.#spawned = true;
    const path = join(
      dirname(fileURLToPath(import.meta.url)),
      "scripts/index.ts",
    );
    const handlers = snapshotWorkerHandlers();
    for (let i = 0; i < this.#count; i++) this.#spawn(path, i, handlers);
    container.logger.info(
      `[WorkerManager] Spawned ${this.#count} worker(s) with ${handlers.length} handler(s).`,
    );
  }

  #getIdealWorker(): WorkerState | null {
    if (this.#workers.length === 0) return null;
    return this.#workers.reduce((best, w) =>
      w.remaining < best.remaining ? w : best,
    );
  }

  #spawn(
    path: string,
    index: number,
    handlers: ReadonlyArray<{ action: string; modulePath: string }>,
  ) {
    const worker = new Worker(path);
    const state: WorkerState = {
      worker,
      remaining: 0,
      readyPromise: this.#sendInit(worker, index, handlers),
    };

    worker.addEventListener("message", (e) => {
      const res = e.data as WorkerResponse;
      const job = this.#pending.get(res.id);
      if (job) {
        clearTimeout(job.timer);
        this.#pending.delete(res.id);
        state.remaining = Math.max(0, state.remaining - 1);
        job.resolve(res);
      }
      this.#process();
    });

    worker.addEventListener("error", (e) => {
      container.logger.error(`[Worker ${index}] Error:`, e);
      state.worker.terminate();

      for (const [id, job] of this.#pending) {
        if (job.workerState === state) {
          clearTimeout(job.timer);
          this.#pending.delete(id);
          job.reject(new Error(`Worker ${index} crashed`));
        }
      }
      state.remaining = 0;

      const scriptPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "scripts/index.ts",
      );
      // Re-spawn with the latest handler snapshot — a module that registered
      // between original spawn and crash should be picked up on restart.
      this.#spawn(scriptPath, index, snapshotWorkerHandlers());
      this.#process();
    });

    this.#workers[index] = state;
  }

  /**
   * Send the one-shot `__INIT__` message and resolve once the worker reports
   * its handler list back. Subsequent dispatches wait on this promise so
   * jobs that race the spawn don't see "unknown action".
   */
  #sendInit(
    worker: Worker,
    index: number,
    handlers: ReadonlyArray<{ action: string; modulePath: string }>,
  ): Promise<void> {
    const id = `init-${index}-${crypto.randomUUID()}`;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        reject(new Error(`Worker ${index} init timed out`));
      }, INIT_TIMEOUT_MS);

      const onMessage = (e: MessageEvent) => {
        const res = e.data as WorkerResponse;
        if (res.id !== id) return;
        clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        if (res.success) resolve();
        else reject(new Error(res.error ?? "Worker init failed"));
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ id, action: INIT_ACTION, payload: handlers });
    });
  }

  #process() {
    while (this.#queue.length > 0) {
      const worker = this.#getIdealWorker();
      if (!worker) break;

      const job = this.#queue.shift();
      if (!job) break;

      worker.remaining++;
      job.workerState = worker;
      // Worker may not have finished init yet. Wait, then dispatch — if the
      // job times out in the meantime, the timeout path drops it.
      worker.readyPromise
        .then(() => {
          if (!this.#pending.has(job.id)) return; // timed out
          try {
            worker.worker.postMessage({
              id: job.id,
              action: job.action,
              payload: job.payload,
            });
          } catch (err: unknown) {
            container.logger.error(
              `[WorkerManager] Failed to post message to worker:`,
              err,
            );
            worker.remaining = Math.max(0, worker.remaining - 1);
            job.workerState = undefined;
            job.reject(new Error("Failed to dispatch job to worker"));
          }
        })
        .catch((err: unknown) => {
          if (!this.#pending.has(job.id)) return;
          this.#pending.delete(job.id);
          clearTimeout(job.timer);
          worker.remaining = Math.max(0, worker.remaining - 1);
          job.reject(
            err instanceof Error ? err : new Error("Worker init failed"),
          );
        });
    }
  }

  #handleTimeout(id: string) {
    const job = this.#pending.get(id);
    if (!job) return;
    this.#pending.delete(id);

    const idx = this.#queue.findIndex((q) => q.id === id);
    if (idx !== -1) {
      this.#queue.splice(idx, 1);
      job.reject(new Error("Timeout before execution"));
      return;
    }

    container.logger.warn(
      `[WorkerManager] Job ${id} timed out during execution.`,
    );
    if (job.workerState) {
      job.workerState.remaining = Math.max(0, job.workerState.remaining - 1);
    }
    job.reject(new Error("Execution Timeout"));
    this.#process();
  }
}
