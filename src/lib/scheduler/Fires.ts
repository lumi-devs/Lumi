import { container, type Container } from "#src/lib/Services.js";
import type { EventBus, BusMessage } from "#src/lib/event-bus/Types.js";
import type { ScheduledTasks } from "#src/lib/types/Common.js";
import { taskFireStream, type FireEnvelope } from "#src/lib/scheduler/Bus.js";
import { extractTraceContext, otelContext } from "#src/observability/Index.ts";

export type TaskFireMode = "unicast" | "broadcast";

export type TaskFireHandler<N extends keyof ScheduledTasks> = (
  services: Container,
  payload: ScheduledTasks[N],
) => Promise<void>;

export type AnyTaskFireHandler = (
  services: Container,
  payload: ScheduledTasks[keyof ScheduledTasks],
) => Promise<void>;

interface AnyRegistration {
  name: keyof ScheduledTasks;
  mode: TaskFireMode;
  handler: AnyTaskFireHandler;
}

const registry = new Map<keyof ScheduledTasks, AnyRegistration>();

let activeConsumer: TaskFireConsumer | null = null;

export function registerTaskFireHandler<N extends keyof ScheduledTasks>(
  name: N,
  mode: TaskFireMode,
  handler: TaskFireHandler<N>,
): void {
  const previous = registry.get(name);
  if (previous) {

    container.logger?.error(
      `[TaskFireRegistry] Handler for task '${String(name)}' is being replaced (was mode=${previous.mode}, now mode=${mode}). If these are different owners, one of them is hijacking the other's task fires.`,
    );
  }
  registry.set(name, { name, mode, handler: handler as AnyTaskFireHandler });

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

export function getRegisteredFireHandlers(): readonly AnyRegistration[] {
  return [...registry.values()];
}

export interface TaskFireConsumerOptions {
  consumerId: string;

  unicastGroup?: string;
  blockMs?: number;
  batchSize?: number;
}

export class TaskFireConsumer {
  private stops: Array<() => Promise<void>> = [];
  private subscribed = new Set<keyof ScheduledTasks>();

  private ephemeralGroups: Array<{ stream: string; group: string }> = [];

  public constructor(
    private readonly services: Container,
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

  public async subscribe(reg: AnyRegistration): Promise<void> {
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
        await reg.handler(this.services, msg.body.payload);
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
