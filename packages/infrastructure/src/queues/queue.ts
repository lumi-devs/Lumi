import { Queue, type QueueOptions } from "bullmq";
import type { IJobQueue, JobStatus, QueueConnectionOptions, QueueJobOptions } from "./types.js";

export class JobQueue<T = unknown> implements IJobQueue<T> {
  readonly #queue: Queue;

  public constructor(
    name: string,
    options: {
      connection?: QueueConnectionOptions;
      defaultJobOptions?: QueueJobOptions;
    } = {},
  ) {
    const queueOpts: QueueOptions = {
      connection: options.connection ?? { host: "localhost", port: 6379 },
      defaultJobOptions: options.defaultJobOptions,
    };
    this.#queue = new Queue(name, queueOpts);
  }

  public get name(): string {
    return this.#queue.name;
  }

  public get rawQueue(): Queue {
    return this.#queue;
  }

  public async add(
    name: string,
    payload: T,
    options?: QueueJobOptions,
  ): Promise<any> {
    return this.#queue.add(name, payload, options);
  }

  public async addBulk(
    jobs: Array<{ name: string; data: T; opts?: QueueJobOptions }>,
  ): Promise<any[]> {
    return this.#queue.addBulk(jobs);
  }

  public async getJob(id: string): Promise<any> {
    return this.#queue.getJob(id);
  }

  public async delete(id: string): Promise<boolean> {
    const job = await this.#queue.getJob(id);
    if (!job) return false;
    await job.remove();
    return true;
  }

  public async getJobCounts(
    ...types: JobStatus[]
  ): Promise<Record<string, number>> {
    return this.#queue.getJobCounts(...(types as any));
  }

  public async clean(
    graceMs: number,
    limit = 1000,
    type: "completed" | "wait" | "active" | "paused" | "delayed" | "failed" = "completed",
  ): Promise<string[]> {
    return this.#queue.clean(graceMs, limit, type);
  }

  public async drain(delayed = false): Promise<void> {
    await this.#queue.drain(delayed);
  }

  public async pause(): Promise<void> {
    await this.#queue.pause();
  }

  public async resume(): Promise<void> {
    await this.#queue.resume();
  }

  public async close(): Promise<void> {
    await this.#queue.close();
  }
}
