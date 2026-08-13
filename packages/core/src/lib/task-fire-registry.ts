import { container } from "@sapphire/framework";
import type { EventBus, BusMessage } from "@lumi/event-bus";
import type { ScheduledTasks } from "#lib/types/common.js";
import { taskFireStream, type FireEnvelope } from "#lib/scheduler-bus.js";
import { extractTraceContext, otelContext } from "@lumi/observability";

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

/** The consumer currently running on this process, if any. */
let activeConsumer: TaskFireConsumer | null = null;

export function registerTaskFireHandler<N extends keyof ScheduledTasks>(
  name: N,
  mode: TaskFireMode,
  handler: TaskFireHandler<N>,
): void {
  const previous = registry.get(name);
  if (previous) {
    // Not refused: reloading an addon re-runs its registration, and that path
    // depends on the replacement landing. But an addon claiming a task name
    // core already owns silently hijacks its fires, so make it audit-visible.
    container.logger?.error(
      `[TaskFireRegistry] Handler for task '${String(name)}' is being replaced (was mode=${previous.mode}, now mode=${mode}). If these are different owners, one of them is hijacking the other's task fires.`,
    );
  }
  registry.set(name, { name, mode, handler } as Registration);

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
  /** Per-replica groups created for `broadcast` tasks, torn down on stop. */
  private ephemeralGroups: Array<{ stream: string; group: string }> = [];

  public constructor(
    private readonly bus: EventBus,
    private readonly opts: TaskFireConsumerOptions,
  ) {}

  public async start(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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
        startId: reg.mode === "broadcast" ? "$" : undefined,
      },
      (msg) => this.handle(reg.name, msg),
    );
    this.stops.push(stop);
    if (reg.mode === "broadcast") this.ephemeralGroups.push({ stream, group });
    container.logger.debug(
      `[TaskFireConsumer] subscribed task='${String(reg.name)}' mode=${reg.mode} group=${group}`,
    );
  }

  public async stopConsuming(): Promise<void> {
    if (activeConsumer === this) activeConsumer = null;
    this.subscribed.clear();
    const stops = this.stops.splice(0);
    await Promise.allSettled(stops.map((s) => s()));

    // A broadcast group is named after this replica and re-created at `$` on
    // the next boot, so leaving it behind strands a dead group (and its pending
    // list) in Redis for every restart the process ever makes.
    const groups = this.ephemeralGroups.splice(0);
    await Promise.allSettled(
      groups.map((g) => this.bus.destroyGroup(g.stream, g.group)),
    );
  }

  private async handle(
    name: keyof ScheduledTasks,
    msg: BusMessage<FireEnvelope>,
  ): Promise<void> {
    const reg = registry.get(name);
    if (!reg) {
      container.logger.warn(
        `[TaskFireConsumer] Fire for '${String(name)}' has no registered handler (module unloaded?); acking.`,
      );
      await msg.ack();
      return;
    }
    const parent = extractTraceContext({
      traceparent: msg.body.traceparent,
      tracestate: msg.body.tracestate,
    });
    await otelContext.with(parent, async () => {
      try {
        await reg.handler(msg.body.payload);
        await msg.ack();
      } catch (err) {
        container.logger.error(
          `[TaskFireConsumer] Handler for '${String(name)}' failed (id=${msg.id}, deliveryCount=${msg.deliveryCount}):`,
          err,
        );
        await msg.nack();
      }
    });
  }
}
