import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { container } from "#lib/services.js";
import {
  getScheduledTask,
  repeatedScheduledTasks,
} from "#lib/scheduler/tasks.js";
import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#lib/scheduler/queue.js";
import type { ScheduleOptions } from "#lib/scheduler/schedule.js";
import { resolveTaskRef, toBullMQJobOptions } from "#lib/scheduler/job-options.js";

export interface RepeatedTaskSpec {
  name: string;
  interval?: number;
  pattern?: string;
  timezone?: string;
  customJobOptions?: JobsOptions;
}

export type CreateTaskOptions = ScheduleOptions;

/**
 * The `container.tasks` surface every process shares: enqueue, cancel, close.
 * The scheduler's runner implements this plus job execution; worker shards get
 * a producer-only stand-in (`scheduler-producer.ts`) with the same shape.
 */
export interface TaskQueue {
  readonly queue: string;
  create(
    task: string | { name: string; payload?: unknown },
    options?: ScheduleOptions,
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
      { connection, concurrency: 10 },
    );
  }

  public async create(
    task: string | { name: string; payload?: unknown },
    options?: ScheduleOptions,
  ): Promise<Job> {
    const { name, payload } = resolveTaskRef(task);
    const jobOptions = toBullMQJobOptions(options);
    return this.client.add(name, payload, jobOptions);
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
    await this.pruneStaleSchedulers(list.map((spec) => spec.name));
  }

  public async pruneStaleSchedulers(known: string[]): Promise<void> {
    const live = new Set(known);
    for (const scheduler of await this.client.getJobSchedulers()) {
      if (!live.has(scheduler.name)) {
        await this.client.removeJobScheduler(scheduler.name);
        container.logger.warn(
          `[Scheduler] Removed orphaned repeatable scheduler '${scheduler.name}'.`,
        );
      }
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
