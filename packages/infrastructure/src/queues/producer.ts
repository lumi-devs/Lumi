import { JobQueue } from "./queue.js";
import type { QueueConnectionOptions, QueueJobOptions, QueueLogger } from "./types.js";

export const DEFAULT_QUEUE_NAME = "scheduled-tasks";

export const DEFAULT_QUEUE_JOB_OPTIONS: QueueJobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

export interface TaskResolvable {
  name: string;
  payload?: unknown;
}

export interface TaskScheduleOptions {
  delay?: number;
  repeated?: boolean;
  interval?: number;
  pattern?: string;
  timezone?: string;
  customJobOptions?: QueueJobOptions;
}

export class TaskQueueProducer {
  readonly #queue: JobQueue;

  public constructor(
    queueName = DEFAULT_QUEUE_NAME,
    options: {
      connection?: QueueConnectionOptions;
      defaultJobOptions?: QueueJobOptions;
      logger?: QueueLogger;
    } = {},
  ) {
    this.#queue = new JobQueue(queueName, {
      connection: options.connection,
      defaultJobOptions: options.defaultJobOptions ?? DEFAULT_QUEUE_JOB_OPTIONS,
      logger: options.logger,
    });
  }

  public get queue(): JobQueue {
    return this.#queue;
  }

  public async schedule(
    task: string | TaskResolvable,
    options?: TaskScheduleOptions | number,
  ): Promise<{ id?: string; name: string }> {
    const name = typeof task === "string" ? task : task.name;
    const payload = typeof task === "string" ? undefined : task.payload;

    if (options === undefined) {
      return this.#queue.add(name, payload);
    }

    if (typeof options === "number") {
      return this.#queue.add(name, payload, { delay: options });
    }

    const { repeated, pattern, interval, delay, customJobOptions, timezone } =
      options;
    let jobOptions: QueueJobOptions = { delay, ...customJobOptions };
    if (repeated) {
      jobOptions = {
        ...jobOptions,
        repeat: interval ? { every: interval } : { pattern, tz: timezone },
      };
    }
    return this.#queue.add(name, payload, jobOptions);
  }

  public async delete(id: string): Promise<boolean> {
    return this.#queue.delete(id);
  }

  public async close(): Promise<void> {
    await this.#queue.close();
  }
}
