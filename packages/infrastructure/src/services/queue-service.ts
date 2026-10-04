import { JobQueue } from "../queues/queue.js";
import type { IJobQueue, QueueConnectionOptions, QueueJobOptions, QueueLogger } from "../queues/types.js";

export class QueueService {
  readonly #queues = new Map<string, JobQueue>();
  readonly #connection?: QueueConnectionOptions;
  readonly #defaultJobOptions?: QueueJobOptions;
  readonly #logger?: QueueLogger;

  public constructor(options: {
    connection?: QueueConnectionOptions;
    defaultJobOptions?: QueueJobOptions;
    logger?: QueueLogger;
  } = {}) {
    this.#connection = options.connection;
    this.#defaultJobOptions = options.defaultJobOptions;
    this.#logger = options.logger;
  }

  public getQueue<T = unknown>(name: string): IJobQueue<T> {
    let queue = this.#queues.get(name);
    if (!queue) {
      queue = new JobQueue<T>(name, {
        connection: this.#connection,
        defaultJobOptions: this.#defaultJobOptions,
        logger: this.#logger,
      });
      this.#queues.set(name, queue);
    }
    return queue;
  }

  public async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.#queues.values()).map((q) => q.close()),
    );
    this.#queues.clear();
  }
}
