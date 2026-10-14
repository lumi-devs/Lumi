import { container, type Container } from "#src/lib/Services.js";
import type { EventBus } from "#src/lib/event-bus/Types.js";
import type { ScheduledTasks } from "#src/lib/types/Common.js";
import { taskFireStream, type FireEnvelope } from "#src/lib/scheduler/Bus.js";

export type TaskFireMode = "unicast" | "broadcast";

export type TaskFireHandler<N extends keyof ScheduledTasks> = (
  services: Container,
  payload: ScheduledTasks[N],
) => Promise<void>;

interface AnyRegistration {
  name: keyof ScheduledTasks;
  mode: TaskFireMode;
  handler: (services: Container, payload: any) => Promise<void>;
}

const registry = new Map<keyof ScheduledTasks, AnyRegistration>();

export function registerTaskFireHandler<N extends keyof ScheduledTasks>(
  name: N,
  mode: TaskFireMode,
  handler: TaskFireHandler<N>,
): void {
  registry.set(name, { name, mode, handler });
}

export function getRegisteredFireHandlers(): readonly AnyRegistration[] {
  return [...registry.values()];
}

export class TaskFireConsumer {
  public constructor(
    private readonly services: Container,
    private readonly bus: EventBus,
    _opts?: any,
  ) {}

  public async start(): Promise<void> {
    for (const reg of registry.values()) {
      const stream = taskFireStream(String(reg.name));
      await this.bus.consume<FireEnvelope>(
        [stream],
        { group: "default", consumer: "local" },
        async (msg) => {
          try {
            await reg.handler(this.services, msg.body.payload);
            await msg.ack();
          } catch (err) {
            container.logger.error(`[TaskFire:${String(reg.name)}] failed:`, err);
            await msg.nack();
          }
        },
      );
    }
  }

  public async stopConsuming(): Promise<void> {}
}
