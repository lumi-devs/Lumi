import type { ScheduledTasks } from "#src/lib/types/Common.js";
import { publishTaskFire } from "#src/lib/scheduler/Bus.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface ScheduledTaskOptions {
  name: string;
  interval?: number | null;
  pattern?: string | null;
  timezone?: string;
  customJobOptions?: any;
}

export abstract class LumiScheduledTask {
  public readonly name: string;
  public readonly interval: number | null;
  public readonly pattern: string | null;
  public readonly timezone?: string | undefined;

  public constructor(options: ScheduledTaskOptions) {
    this.name = options.name;
    this.interval = options.interval ?? null;
    this.pattern = options.pattern ?? null;
    this.timezone = options.timezone;
  }

  public abstract run(payload: unknown): Promise<unknown>;
}

export abstract class RelayTask<
  K extends keyof ScheduledTasks,
> extends LumiScheduledTask {
  public async run(
    payload: ScheduledTasks[K] extends never ? undefined : ScheduledTasks[K],
  ): Promise<void> {
    const name = this.name as K;
    await publishTaskFire(name, (payload ?? {}) as ScheduledTasks[K]);
  }
}

const registry = new Map<string, LumiScheduledTask>();

export function registerScheduledTask(task: LumiScheduledTask): void {
  registry.set(task.name, task);
}

export function getScheduledTask(name: string): LumiScheduledTask | undefined {
  return registry.get(name);
}

export function repeatedScheduledTasks(): LumiScheduledTask[] {
  return [...registry.values()].filter(
    (task) => task.interval != null || task.pattern != null,
  );
}

export async function loadScheduledTasks(moduleDir: string): Promise<number> {
  const tasksDir = join(moduleDir, "tasks");
  let loaded = 0;
  let files: string[];
  try {
    files = await readdir(tasksDir);
  } catch {
    return 0;
  }
  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;
    if (file.endsWith(".test.ts") || file.endsWith(".test.js")) continue;
    const imported = await import(pathToFileURL(join(tasksDir, file)).href);
    for (const Exported of Object.values(imported)) {
      if (
        typeof Exported === "function" &&
        Exported.prototype instanceof LumiScheduledTask
      ) {
        const TaskCtor = Exported as new () => LumiScheduledTask;
        registerScheduledTask(new TaskCtor());
        loaded++;
      }
    }
  }
  return loaded;
}
