import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { container } from "#lib/services.js";
import {
  getScheduledTask,
  repeatedScheduledTasks,
} from "#lib/scheduled-tasks.js";
import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#lib/client/scheduled-tasks-queue.js";

export interface RepeatedTaskSpec {
  name: string;
  interval?: number;
  pattern?: string;
  timezone?: string;
  customJobOptions?: JobsOptions;
}

export type CreateTaskOptions =
  | number
  | {
      repeated?: boolean;
      delay?: number;
      interval?: number;
      pattern?: string;
      timezone?: string;
      customJobOptions?: JobsOptions;
    };

/**
 * The `container.tasks` surface every process shares: enqueue, cancel, close.
 * The scheduler's runner implements this plus job execution; worker shards get
 * a producer-only stand-in (`scheduler-producer.ts`) with the same shape.
 */
export interface TaskQueue {
  readonly queue: string;
  create(
    task: string | { name: string; payload?: unknown },
    options?: CreateTaskOptions,
  ): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Scheduler-side task runner: owns the BullMQ `Queue` + `Worker` pair,
 * dispatches jobs to registered tasks by name, and registers repeatables.
 * Only `apps/scheduler` constructs this; every other process uses the
 * producer-only stand-in and never executes a task.
 */
export class ScheduledTaskRunner implements TaskQueue {
  public readonly queue = SCHEDULED_TASKS_QUEUE_NAME;
  public readonly client: Queue;
  public readonly options: {
    connection: ReturnType<typeof getScheduledTasksConnectionOptions>;
  };
  readonly #worker: Worker;

  public constructor() {
    const connection = getScheduledTasksConnectionOptions();
    this.options = { connection };
    this.client = new Queue(this.queue, {
      connection,
      defaultJobOptions: { ...SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS },
    });
    this.#worker = new Worker(
      this.queue,
      (job) => this.execute(job.name, job.data),
      { connection },
    );
  }

  public async create(
    task: string | { name: string; payload?: unknown },
    options?: CreateTaskOptions,
  ): Promise<Job> {
    const taskName = typeof task === "string" ? task : task.name;
    const payload = typeof task === "string" ? undefined : task.payload;
    if (options === undefined) return this.client.add(taskName, payload);
    if (typeof options === "number") {
      return this.client.add(taskName, payload, { delay: options });
    }
    const { repeated, pattern, interval, delay, customJobOptions, timezone } =
      options;
    return this.client.add(taskName, payload, {
      delay,
      ...customJobOptions,
      ...(repeated
        ? { repeat: interval ? { every: interval } : { pattern, tz: timezone } }
        : {}),
    });
  }

  public async createRepeated(specs?: RepeatedTaskSpec[]): Promise<void> {
    const list =
      specs ??
      repeatedScheduledTasks().map((task) => ({
        name: task.name,
        interval: task.interval ?? undefined,
        pattern: task.pattern ?? undefined,
        timezone: task.timezone,
        customJobOptions: task.customJobOptions,
      }));
    for (const spec of list) {
      await this.create(spec.name, {
        repeated: true,
        interval: spec.interval,
        pattern: spec.pattern,
        timezone: spec.timezone,
        customJobOptions: spec.customJobOptions,
      });
    }
  }

  public async execute(name: string, payload: unknown): Promise<void> {
    const task = getScheduledTask(name);
    if (!task) {
      container.logger.warn(
        `[Scheduler] No task registered for job '${name}', dropping.`,
      );
      return;
    }
    try {
      await task.run(payload);
    } catch (err: unknown) {
      container.logger.fatal(`[Task:${name}] failed`, { payload }, err);
      throw err;
    }
  }

  public async delete(id: string): Promise<void> {
    await (await this.client.getJob(id))?.remove();
  }

  public async close(): Promise<void> {
    await Promise.all([this.client.close(), this.#worker.close()]);
  }
}
