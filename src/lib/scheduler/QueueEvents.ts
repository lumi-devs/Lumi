import { QueueEvents, type QueueEventsOptions } from "bullmq";
import type { FailedJobInfo, QueueConnectionOptions, QueueLogger } from "#src/lib/scheduler/QueueTypes.js";

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

  public async close(): Promise<void> {
    await this.#events.close();
  }
}
