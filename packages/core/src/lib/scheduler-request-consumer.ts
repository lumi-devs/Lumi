import { container } from "@sapphire/framework";
import type { EventBus, BusMessage } from "@lumi/event-bus";
import {
  SCHEDULER_REQUEST_STREAM,
  type RequestEnvelope,
} from "#lib/scheduler-bus.js";

type CreateOptions = Extract<RequestEnvelope, { action: "create" }>["options"];

/**
 * Default a one-shot create's BullMQ jobId to the stream entry id. The request
 * stream is at-least-once, so a redelivered `create` would otherwise enqueue a
 * second copy of the same job; the entry id is stable across redeliveries, and
 * BullMQ rejects a duplicate jobId. Repeated jobs are left alone - BullMQ keys
 * them by their repeat pattern already and disallows a custom id.
 */
function withIdempotentJobId(
  options: CreateOptions,
  streamId: string,
): CreateOptions {
  const base =
    typeof options === "number"
      ? { repeated: false, delay: options }
      : { ...options };
  if (base.repeated) return options;
  return {
    ...base,
    customJobOptions: {
      jobId: `req:${streamId}`,
      ...base.customJobOptions,
    },
  };
}

export interface SchedulerRequestConsumerOptions {
  consumerId: string;
  group?: string;
  blockMs?: number;
  batchSize?: number;
}

export class SchedulerRequestConsumer {
  private stop?: () => Promise<void>;

  public constructor(
    private readonly bus: EventBus,
    private readonly opts: SchedulerRequestConsumerOptions,
  ) {}

  public async start(): Promise<void> {
    this.stop = await this.bus.consume<RequestEnvelope>(
      [SCHEDULER_REQUEST_STREAM],
      {
        group: this.opts.group ?? "lumi-scheduler",
        consumer: this.opts.consumerId,
        blockMs: this.opts.blockMs,
        batchSize: this.opts.batchSize,
      },
      (msg) => this.handle(msg),
    );
  }

  public async stopConsuming(): Promise<void> {
    await this.stop?.();
    this.stop = undefined;
  }

  private async handle(msg: BusMessage<RequestEnvelope>): Promise<void> {
    const env = msg.body;
    try {
      if (env.action === "create") {
        await container.tasks.create(
          { name: env.name, payload: env.payload },
          withIdempotentJobId(
            env.options,
            msg.id,
          ) as Parameters<typeof container.tasks.create>[1],
        );
      } else if (env.action === "delete") {
        await container.tasks.delete(env.jobId);
      } else {
        container.logger.warn(
          `[SchedulerRequestConsumer] Unknown action in envelope:`,
          env,
        );
      }
      await msg.ack();
    } catch (err) {
      container.logger.error(
        `[SchedulerRequestConsumer] Failed to apply request (id=${msg.id}, deliveryCount=${msg.deliveryCount}):`,
        err,
      );
      if (msg.deliveryCount >= 5) {
        container.logger.error(
          `[SchedulerRequestConsumer] Poison message dead-lettered after ${msg.deliveryCount} attempts (id=${msg.id}). Investigate manually.`,
        );
        await msg.ack();
      } else {
        await msg.nack();
      }
    }
  }
}
