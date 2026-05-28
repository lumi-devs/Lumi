import { container } from "@sapphire/framework";
import { envParseInteger } from "#lib/env.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { WorkerResponse } from "./types.js";

export { WorkerAction } from "./types.js";
export type { WorkerRequest, WorkerResponse } from "./types.js";

/** Default per-job timeout for worker-thread RPC. */
export const JOB_TIMEOUT_MS = 30_000;

interface WorkerState {
  worker: Worker;
  remaining: number; // in-flight job count
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

export class WorkerManager {
  readonly #workers: WorkerState[] = [];
  readonly #queue: QueuedJob[] = [];
  readonly #pending = new Map<string, QueuedJob>();

  public constructor(count = envParseInteger("WORKER_COUNT", 2)) {
    const path = join(
      dirname(fileURLToPath(import.meta.url)),
      "scripts/index.ts",
    );
    for (let i = 0; i < count; i++) this.#spawn(path, i);
    container.logger.info(`[WorkerManager] Initialized with ${count} workers.`);
  }

  public async send<T = unknown>(
    action: string,
    payload: unknown,
    timeoutMs = JOB_TIMEOUT_MS,
  ): Promise<T> {
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

  public broadcast<T = unknown>(
    action: string,
    payload: unknown,
    timeoutMs = JOB_TIMEOUT_MS,
  ): Promise<T[]> {
    return Promise.all(
      this.#workers.map((state) =>
        this.#sendToWorker<T>(state, action, payload, timeoutMs),
      ),
    );
  }

  #sendToWorker<T>(
    state: WorkerState,
    action: string,
    payload: unknown,
    timeoutMs: number,
  ): Promise<T> {
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

  #getIdealWorker(): WorkerState | null {
    if (this.#workers.length === 0) return null;
    return this.#workers.reduce((best, w) =>
      w.remaining < best.remaining ? w : best,
    );
  }

  #spawn(path: string, index: number) {
    const worker = new Worker(path);
    const state: WorkerState = { worker, remaining: 0 };

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
      this.#spawn(scriptPath, index);
      this.#process();
    });

    this.#workers[index] = state;
  }

  #process() {
    while (this.#queue.length > 0) {
      const worker = this.#getIdealWorker();
      if (!worker) break;

      const job = this.#queue.shift();
      if (!job) break;

      worker.remaining++;
      job.workerState = worker;
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
