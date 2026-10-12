import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { JobsOptions } from "bullmq";
import { container } from "#src/lib/Services.js";
import { Time } from "#src/shared/Index.ts";
import { SpanKind } from "@opentelemetry/api";
import { otelContext, withSpan } from "#src/observability/Index.ts";
import type { ScheduledTasks } from "#src/lib/types/Common.js";
import { publishTaskFire } from "#src/lib/scheduler/Bus.js";
import { unwrapTraceContext } from "#src/lib/scheduler/Otel.js";
import { SCHEDULED_TASKS_QUEUE_NAME } from "#src/lib/scheduler/Queue.js";

export interface CatchUpMeta {

  scheduledFor?: number;

  catchUp?: boolean;
}

const DefaultCatchupGraceMs = Time.Minute;

export function shouldRunNow(
  taskName: string,
  payload?: unknown,
  graceMs = DefaultCatchupGraceMs,
): boolean {
  if (!payload || typeof payload !== "object") return true;
  const meta = payload as CatchUpMeta;
  if (meta.catchUp !== false) return true;
  if (meta.scheduledFor === undefined) return true;

  const overdueBy = Date.now() - meta.scheduledFor;
  if (overdueBy <= graceMs) return true;

  container.logger.debug(
    `[ScheduledTask] Dropping overdue '${taskName}' job (overdue ${overdueBy}ms, catchUp=false).`,
  );
  return false;
}

export interface ScheduledTaskOptions {
  name: string;
  interval?: number | null;
  pattern?: string | null;
  timezone?: string;
  customJobOptions?: JobsOptions;
}

export abstract class LumiScheduledTask {
  public readonly name: string;
  public readonly interval: number | null;
  public readonly pattern: string | null;
  public readonly timezone?: string | undefined;
  public readonly customJobOptions?: JobsOptions | undefined;

  public constructor(options: ScheduledTaskOptions) {
    this.name = options.name;
    this.interval = options.interval ?? null;
    this.pattern = options.pattern ?? null;
    this.timezone = options.timezone;
    this.customJobOptions = options.customJobOptions;
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
    const { payload: unwrapped, context, messageId } = unwrapTraceContext(
      payload,
    );
    const resolved = (unwrapped ?? {}) as ScheduledTasks[K];
    const fire = async (): Promise<void> => {
      if (!shouldRunNow(name, resolved)) return;
      await publishTaskFire(name, resolved);
    };

    if (!context) {
      await fire();
      return;
    }

    await otelContext.with(context, () =>
      withSpan(
        `job ${String(name)}`,
        async (span) => {
          span.setAttributes({
            "messaging.system": "bullmq",
            "messaging.destination.name": SCHEDULED_TASKS_QUEUE_NAME,
            "messaging.operation": "process",
            ...(messageId ? { "messaging.message.id": messageId } : {}),
          });
          await fire();
        },
        { kind: SpanKind.CONSUMER },
      ),
    );
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
  const dir = join(moduleDir, "tasks");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  let count = 0;
  for (const file of entries.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".js"),
  )) {
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as Record<
      string,
      unknown
    >;
    for (const value of Object.values(mod)) {
      if (
        typeof value === "function" &&
        (value as { prototype?: unknown }).prototype instanceof
          LumiScheduledTask
      ) {
        registerScheduledTask(new (value as new () => LumiScheduledTask)());
        count++;
      }
    }
  }
  return count;
}
