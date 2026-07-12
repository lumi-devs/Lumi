// Worker-side: dispatch `FireEnvelope`s from the bus to a per-task handler. Modules
// register their effect-executor with `registerTaskFireHandler(name, mode, handler)`
// (at file top or during setup); on worker/monolith boot, LumiClient starts a
// `TaskFireConsumer` that subscribes to every registered fire-stream and runs the
// handler. Handlers registered AFTER the consumer started (hot-installed addons)
// are subscribed immediately, and dispatch always resolves the handler through
// the registry so a module reload swaps in the new closure.
//
// `mode` drives consumer-group naming. "unicast" puts all workers in one group so
// exactly one handles each fire — right for one-shot side-effects (mod-lift,
// afk-delete-message, tempvc-cleanup). "broadcast" gives each worker its own group so
// every worker processes every fire and iterates its own guilds.cache — right for
// periodic sweepers (captcha-expiry) and DB sweepers that no-op safely
// under N consumers (flush-logs).

import { container } from "@sapphire/framework";
import type { EventBus, BusMessage } from "@lumi/event-bus";
import type { ScheduledTasks } from "#core/types/common.js";
import { taskFireStream, type FireEnvelope } from "#lib/scheduler-bus.js";

export type TaskFireMode = "unicast" | "broadcast";

export type TaskFireHandler<N extends keyof ScheduledTasks> = (
  payload: ScheduledTasks[N],
) => Promise<void>;

interface Registration<N extends keyof ScheduledTasks = keyof ScheduledTasks> {
  name: N;
  mode: TaskFireMode;
  handler: TaskFireHandler<N>;
}

const registry = new Map<keyof ScheduledTasks, Registration>();

/** The consumer currently running on this process, if any (worker/monolith). */
let activeConsumer: TaskFireConsumer | null = null;

export function registerTaskFireHandler<N extends keyof ScheduledTasks>(
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

  // A hot-installed addon registers after boot; subscribe its stream now so
  // fires work without a process restart.
  if (activeConsumer) {
    void activeConsumer
      .subscribe(registry.get(name)!)
      .catch((err: unknown) =>
        container.logger.error(
          `[TaskFireRegistry] Late subscribe for '${String(name)}' failed:`,
          err,
        ),
      );
  }
}

export function getRegisteredFireHandlers(): readonly Registration[] {
  return [...registry.values()];
}

export interface TaskFireConsumerOptions {
  consumerId: string;
  /** Group name for "unicast" subscriptions. Default "lumi-workers". */
  unicastGroup?: string;
  blockMs?: number;
  batchSize?: number;
}

export class TaskFireConsumer {
  private stops: Array<() => Promise<void>> = [];
  private subscribed = new Set<keyof ScheduledTasks>();

  public constructor(
    private readonly bus: EventBus,
    private readonly opts: TaskFireConsumerOptions,
  ) {}

  public async start(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
    activeConsumer = this;
    const handlers = getRegisteredFireHandlers();
    if (handlers.length === 0) {
      container.logger.info(
        "[TaskFireConsumer] No task-fire handlers registered; nothing to subscribe to.",
      );
      return;
    }
    for (const reg of handlers) {
      await this.subscribe(reg);
    }
  }

  /** Subscribe one registration's fire-stream. Idempotent per task name. */
  public async subscribe(reg: Registration): Promise<void> {
    if (this.subscribed.has(reg.name)) return;
    this.subscribed.add(reg.name);

    const unicastGroup = this.opts.unicastGroup ?? "lumi-workers";
    const stream = taskFireStream(String(reg.name));
    const group =
      reg.mode === "broadcast"
        ? `lumi-worker:${this.opts.consumerId}`
        : unicastGroup;
    const stop = await this.bus.consume<FireEnvelope>(
      [stream],
      {
        group,
        consumer: this.opts.consumerId,
        blockMs: this.opts.blockMs,
        batchSize: this.opts.batchSize,
      },
      (msg) => this.handle(reg.name, msg),
    );
    this.stops.push(stop);
    container.logger.debug(
      `[TaskFireConsumer] subscribed task='${String(reg.name)}' mode=${reg.mode} group=${group}`,
    );
  }

  public async stopConsuming(): Promise<void> {
    if (activeConsumer === this) activeConsumer = null;
    this.subscribed.clear();
    const stops = this.stops.splice(0);
    await Promise.allSettled(stops.map((s) => s()));
  }

  private async handle(
    name: keyof ScheduledTasks,
    msg: BusMessage<FireEnvelope>,
  ): Promise<void> {
    // Resolve through the registry at dispatch time — a module reload replaces
    // the registration, and the stale closure captured at subscribe time must
    // not win.
    const reg = registry.get(name);
    if (!reg) {
      container.logger.warn(
        `[TaskFireConsumer] Fire for '${String(name)}' has no registered handler (module unloaded?); acking.`,
      );
      await msg.ack();
      return;
    }
    try {
      await (reg.handler as TaskFireHandler<keyof ScheduledTasks>)(
        msg.body.payload,
      );
      await msg.ack();
    } catch (err) {
      container.logger.error(
        `[TaskFireConsumer] Handler for '${String(name)}' failed (id=${msg.id}, deliveryCount=${msg.deliveryCount}):`,
        err,
      );
      // Leave pending so it can be reclaimed / retried by another consumer.
      await msg.nack();
    }
  }
}
