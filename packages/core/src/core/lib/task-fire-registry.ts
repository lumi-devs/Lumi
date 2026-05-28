// Worker-side: dispatch `FireEnvelope`s from the bus to a per-task handler.
//
// Modules register their effect-executor at the top of their file (or during
// module setup) by calling `registerTaskFireHandler(name, mode, handler)`.
// On worker / monolith boot, EmberClient starts a `TaskFireConsumer` that
// subscribes to every registered fire-stream and runs the handler.
//
// `mode` drives consumer-group naming:
//   - "unicast"   → all workers share one group, exactly one handles each fire.
//                  Right for one-shot side-effects (mod-lift, afk-delete-message,
//                  tempvc-cleanup).
//   - "broadcast" → each worker gets its own group, so every worker processes
//                  every fire (and iterates its own guilds.cache). Right for
//                  periodic sweepers (captcha-expiry, thread-cleaner) and for
//                  pure-DB sweepers that can no-op safely under N consumers
//                  (flush-logs).

import { container } from "@sapphire/framework";
import type { EventBus, BusMessage } from "@ember/event-bus";
import type { EmberScheduledTasks } from "#core/types/common.js";
import {
  taskFireStream,
  type FireEnvelope,
} from "#lib/scheduler-bus.js";

export type TaskFireMode = "unicast" | "broadcast";

export type TaskFireHandler<N extends keyof EmberScheduledTasks> = (
  payload: EmberScheduledTasks[N],
) => Promise<void>;

interface Registration<N extends keyof EmberScheduledTasks = keyof EmberScheduledTasks> {
  name: N;
  mode: TaskFireMode;
  handler: TaskFireHandler<N>;
}

const registry = new Map<keyof EmberScheduledTasks, Registration>();

export function registerTaskFireHandler<N extends keyof EmberScheduledTasks>(
  name: N,
  mode: TaskFireMode,
  handler: TaskFireHandler<N>,
): void {
  if (registry.has(name)) {
    // Overwrite is fine (hot-reload during dev); warn so we notice in prod.
    container.logger?.warn(
      `[TaskFireRegistry] Overwriting handler for task '${String(name)}'`,
    );
  }
  registry.set(name, { name, mode, handler } as Registration);
}

export function getRegisteredFireHandlers(): readonly Registration[] {
  return [...registry.values()];
}

export interface TaskFireConsumerOptions {
  consumerId: string;
  /** Group name for "unicast" subscriptions. Default "ember-workers". */
  unicastGroup?: string;
  blockMs?: number;
  batchSize?: number;
}

export class TaskFireConsumer {
  private stops: Array<() => Promise<void>> = [];

  public constructor(
    private readonly bus: EventBus,
    private readonly opts: TaskFireConsumerOptions,
  ) {}

  public async start(): Promise<void> {
    const handlers = getRegisteredFireHandlers();
    if (handlers.length === 0) {
      container.logger.info(
        "[TaskFireConsumer] No task-fire handlers registered; nothing to subscribe to.",
      );
      return;
    }
    const unicastGroup = this.opts.unicastGroup ?? "ember-workers";

    for (const reg of handlers) {
      const stream = taskFireStream(String(reg.name));
      const group =
        reg.mode === "broadcast"
          ? `ember-worker:${this.opts.consumerId}`
          : unicastGroup;
      const stop = await this.bus.consume<FireEnvelope>(
        [stream],
        {
          group,
          consumer: this.opts.consumerId,
          blockMs: this.opts.blockMs,
          batchSize: this.opts.batchSize,
        },
        (msg) => this.handle(reg, msg),
      );
      this.stops.push(stop);
      container.logger.debug(
        `[TaskFireConsumer] subscribed task='${String(reg.name)}' mode=${reg.mode} group=${group}`,
      );
    }
  }

  public async stopConsuming(): Promise<void> {
    const stops = this.stops.splice(0);
    await Promise.allSettled(stops.map((s) => s()));
  }

  private async handle(
    reg: Registration,
    msg: BusMessage<FireEnvelope>,
  ): Promise<void> {
    try {
      await (reg.handler as TaskFireHandler<keyof EmberScheduledTasks>)(
        msg.body.payload,
      );
      await msg.ack();
    } catch (err) {
      container.logger.error(
        `[TaskFireConsumer] Handler for '${String(reg.name)}' failed (id=${msg.id}, deliveryCount=${msg.deliveryCount}):`,
        err,
      );
      // Leave pending so it can be reclaimed / retried by another consumer.
      await msg.nack();
    }
  }
}
