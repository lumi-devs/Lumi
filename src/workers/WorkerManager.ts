import { container } from "@sapphire/framework";
import { envParseInteger } from "#lib/env.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

export enum WorkerAction {
  PING = "PING",
  MODERATION_FILTER = "MODERATION_FILTER",
}

export interface WorkerRequest {
  id: string;
  action: string;
  payload: unknown;
}
export interface WorkerResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface WorkerState {
  worker: Worker;
  idle: boolean;
  activeId: string | null;
}

interface QueuedJob {
  id: string;
  action: string;
  payload: unknown;
  timeoutMs: number;
  resolve: (res: WorkerResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class WorkerManager {
  private readonly _workers: WorkerState[] = [];
  private readonly _queue: QueuedJob[] = [];
  private readonly _pending = new Map<string, QueuedJob>();

  public constructor(count = envParseInteger("WORKER_COUNT", 2)) {
    const path = join(
      dirname(fileURLToPath(import.meta.url)),
      "scripts/index.ts",
    );
    for (let i = 0; i < count; i++) this._spawn(path, i);
    container.logger.info(`[WorkerManager] Initialized with ${count} workers.`);
  }

  public async send<T = unknown>(
    action: string,
    payload: unknown,
    timeoutMs = 30_000,
  ): Promise<T> {
    const id = crypto.randomUUID();
    const promise = new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => this._handleTimeout(id), timeoutMs);
      const job = { id, action, payload, timeoutMs, resolve, reject, timer };
      this._queue.push(job);
      this._pending.set(id, job);
    });

    this._process();
    const res = await promise;
    if (!res.success) throw new Error(res.error ?? "Worker Error");
    return res.data as T;
  }

  public destroy() {
    for (const w of this._workers) w.worker.terminate();
    for (const j of this._pending.values()) {
      clearTimeout(j.timer);
      j.reject(new Error("Destroyed"));
    }
    this._workers.length = 0;
    this._queue.length = 0;
    this._pending.clear();
  }

  private _spawn(path: string, index: number) {
    const worker = new Worker(path);
    const state: WorkerState = { worker, idle: true, activeId: null };

    worker.addEventListener("message", (e) => {
      const res = e.data as WorkerResponse;
      const job = this._pending.get(res.id);
      if (job) {
        clearTimeout(job.timer);
        this._pending.delete(res.id);
        job.resolve(res);
      }
      state.idle = true;
      state.activeId = null;
      this._process();
    });

    worker.addEventListener("error", (e) => {
      container.logger.error(`[Worker ${index}] Error:`, e);
      // If the worker crashes, terminate it and spawn a new one to keep the pool healthy
      state.worker.terminate();
      const scriptPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "scripts/index.ts",
      );
      this._spawn(scriptPath, index);

      // If it was processing a job, reject it
      if (state.activeId) {
        const job = this._pending.get(state.activeId);
        if (job) {
          clearTimeout(job.timer);
          this._pending.delete(state.activeId);
          job.reject(new Error("Worker process error"));
        }
      }
      this._process();
    });

    this._workers[index] = state;
  }

  private _process() {
    const worker = this._workers.find((w) => w.idle);
    const job = this._queue.shift();
    if (!worker || !job) {
      if (job) this._queue.unshift(job);
      return;
    }

    worker.idle = false;
    worker.activeId = job.id;
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
      job.reject(new Error("Failed to dispatch job to worker"));
      worker.idle = true;
      worker.activeId = null;
    }
  }

  private _handleTimeout(id: string) {
    const job = this._pending.get(id);
    if (!job) return;
    this._pending.delete(id);

    const idx = this._queue.findIndex((q) => q.id === id);
    if (idx !== -1)
      return (
        this._queue.splice(idx, 1) &&
        job.reject(new Error("Timeout before execution"))
      );

    const wIdx = this._workers.findIndex((w) => w.activeId === id);
    if (wIdx !== -1) {
      const state = this._workers[wIdx]!;
      container.logger.warn(
        `[WorkerManager] Worker ${wIdx} timed out. Reaping.`,
      );
      state.worker.terminate();
      this._spawn(
        join(dirname(fileURLToPath(import.meta.url)), "scripts/index.ts"),
        wIdx,
      );
      job.reject(new Error("Execution Timeout"));
      this._process();
    }
  }
}
