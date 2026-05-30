// Scheduler-side: consume `RequestEnvelope`s published by other roles and
// translate them into the local BullMQ-backed `container.tasks` operations.
// Started by EmberClient.login() when `roleOwnsScheduler(role)` is true.
//
// Redeliveries are safe: workers stamp `customJobOptions.jobId` for cancel/replace
// and BullMQ deduplicates by jobId, so re-applying a redelivery (deliveryCount >= 2)
// is fine as long as we don't error out on "already exists".

import { container } from "@sapphire/framework";
import type { EventBus, BusMessage } from "@ember/event-bus";
import {
  SCHEDULER_REQUEST_STREAM,
  type RequestEnvelope,
} from "#lib/scheduler-bus.js";

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
        group: this.opts.group ?? "ember-scheduler",
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
          { name: env.name, payload: env.payload } as Parameters<
            typeof container.tasks.create
          >[0],
          env.options as Parameters<typeof container.tasks.create>[1],
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
      await msg.ack();
    }
  }
}
