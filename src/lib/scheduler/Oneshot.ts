import { container, type Container } from "#src/lib/Services.js";
import { LumiScheduledTask, registerScheduledTask } from "#src/lib/scheduler/Tasks.js";
import { scheduleTask } from "#src/lib/scheduler/Schedule.js";
import type { ModuleOneshotPayload } from "#src/lib/types/Common.js";

export type OneshotContext = {
  guildId: string;
  data: unknown;
};

export type OneshotHandler = (
  services: Container,
  ctx: OneshotContext,
) => Promise<void>;

export type OneshotMap = Record<string, OneshotHandler>;

export async function scheduleOneshot(
  services: Container,
  module: string,
  name: string,
  guildId: string,
  delayMs: number,
  data?: unknown,
): Promise<void> {
  const payload: ModuleOneshotPayload = { module, name, guildId, data };
  if (services === container) {
    await scheduleTask("module-oneshot", payload, delayMs);
    return;
  }
  await services.tasks.create(
    { name: "module-oneshot", payload },
    delayMs,
  );
}

class ModuleOneshotTask extends LumiScheduledTask {
  public constructor() {
    super({ name: "module-oneshot" });
  }

  public async run(payload: unknown): Promise<void> {
    const { module, name, guildId, data } = payload as ModuleOneshotPayload;
    const handler = container.moduleStore.getOneshot(module, name);
    if (!handler) {
      container.logger.warn(
        `[Scheduler] No oneshot '${name}' in module '${module}', dropping.`,
      );
      return;
    }
    await handler(container, { guildId, data: data ?? null });
  }
}

export function registerBuiltinTasks(): void {
  registerScheduledTask(new ModuleOneshotTask());
}
