import { QueueEvents, type Queue, type QueueEventsOptions } from "bullmq";
import type { FailedJobInfo, QueueConnectionOptions, QueueLogger } from "./types.js";

export class QueueEventsWatcher {
  readonly #events: QueueEvents;
  readonly #queueName: string;
  readonly #logger?: QueueLogger;

  public constructor(
    queueName: string,
    options: {
      connection?: QueueConnectionOptions;
      logger?: QueueLogger;
    } = {},
  ) {
    this.#queueName = queueName;
    this.#logger = options.logger;
    const eventOpts: QueueEventsOptions = {
      connection: options.connection ?? { host: "localhost", port: 6379 },
    };
    this.#events = new QueueEvents(queueName, eventOpts);

    this.#events.on("error", (err: Error) => {
      this.#logger?.warn?.(`[QueueEvents:${this.#queueName}] Connection error:`, err);
    });
  }

  public get events(): QueueEvents {
    return this.#events;
  }

  /**
   * Watches for failed jobs and resolves whether they exhausted all retry attempts.
   */
  public watchExhaustedRetries(
    getJobFn: (jobId: string) => Promise<{
      name?: string;
      attemptsMade?: number;
      opts?: { attempts?: number };
      failedReason?: string;
    } | null | undefined>,
    onExhausted: (info: FailedJobInfo) => void | Promise<void>,
  ): () => void {
    const handler = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      void (async () => {
        try {
          const job = await getJobFn(jobId);
          const attemptsMade = job?.attemptsMade ?? 0;
          const maxAttempts = job?.opts?.attempts ?? 0;
          if (attemptsMade >= maxAttempts) {
            await onExhausted({
              jobId,
              name: job?.name ?? "unknown",
              attemptsMade,
              maxAttempts,
              failedReason,
            });
          }
        } catch (err) {
          this.#logger?.warn?.(
            `[QueueEvents:${this.#queueName}] Failed to process failed job event:`,
            err,
          );
        }
      })();
    };

    this.#events.on("failed", handler);
    return () => {
      this.#events.removeListener("failed", handler);
    };
  }

  public onCompleted(
    handler: (args: { jobId: string; returnvalue: string }) => void,
  ): () => void {
    this.#events.on("completed", handler);
    return () => {
      this.#events.removeListener("completed", handler);
    };
  }

  public async close(): Promise<void> {
    await this.#events.close();
  }
}

/**
 * Higher-level helper to watch failed jobs on a queue.
 */
export function watchFailedJobs(
  queue: Queue | { queue: string; options?: { connection?: QueueConnectionOptions }; client: { getJob: (id: string) => Promise<any> } },
  logger?: QueueLogger,
  onExhausted?: (info: FailedJobInfo) => void,
): { close(): Promise<void> } {
  const queueName = "queue" in queue && typeof queue.queue === "string" ? queue.queue : (queue as Queue).name;
  const connection = "options" in queue && queue.options?.connection ? queue.options.connection : undefined;

  const watcher = new QueueEventsWatcher(queueName, { connection, logger });

  watcher.watchExhaustedRetries(
    async (id) => {
      if ("client" in queue && queue.client) {
        return (queue.client as any).getJob(id);
      }
      if ("getJob" in queue && typeof (queue).getJob === "function") {
        return (queue).getJob(id);
      }
      return null;
    },
    (info) => {
      logger?.error?.(
        `[Scheduler] Job '${info.name}' failed after ${info.attemptsMade} attempt(s).`,
      );
      onExhausted?.(info);
    },
  );

  return {
    close: () => watcher.close(),
  };
}
