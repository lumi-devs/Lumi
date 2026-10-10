import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { JobsOptions } from "bullmq";
import { container } from "@lumi/lib/services.js";
import { Time } from "@lumi/shared";
import { SpanKind } from "@opentelemetry/api";
import { otelContext, withSpan } from "@lumi/observability";
import type { ScheduledTasks } from "@lumi/lib/types/common.js";
import { publishTaskFire } from "@lumi/lib/scheduler/bus.js";
import { unwrapTraceContext } from "@lumi/lib/scheduler/otel.js";
import { SCHEDULED_TASKS_QUEUE_NAME } from "@lumi/lib/scheduler/queue.js";

/**
 * Catch-up metadata every scheduled-task payload may carry. BullMQ will
 * happily fire a delayed job the moment a worker comes back up, even if its
 * target time elapsed during a long downtime. For some jobs that is correct
 * (lift an expired mute); for others it produces a thundering herd of stale
 * work (delete a welcome message that's long irrelevant).
 *
 * Tasks opt out by setting `catchUp: false` and stamping `scheduledFor` at
 * creation time; {@link shouldRunNow} then drops jobs overdue beyond the grace.
 */
export interface CatchUpMeta {
  /** Epoch ms the job was originally meant to fire. */
  scheduledFor?: number;
  /**
   * When `false`, a job overdue by more than the grace window is dropped instead
   * of run. Defaults to `true` (run regardless - the historical behaviour).
   */
  catchUp?: boolean;
}

/** Default tolerance before a `catchUp: false` job is treated as stale. */
const DefaultCatchupGraceMs = Time.Minute;

/**
 * Decide whether a scheduled task should run now given its catch-up policy.
 * Call at the top of a task `run`; returns `false` (and logs) only when
 * the job opted out of catch-up and is overdue beyond `graceMs`.
 */
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

/**
 * Plain scheduled-task base: name, repeat schedule, and a `run` to execute.
 * No piece system involved - the scheduler instantiates these directly.
 */
export abstract class LumiScheduledTask {
  public readonly name: string;
  public readonly interval: number | null;
  public readonly pattern: string | null;
  public readonly timezone?: string;
  public readonly customJobOptions?: JobsOptions;

  public constructor(options: ScheduledTaskOptions) {
    this.name = options.name;
    this.interval = options.interval ?? null;
    this.pattern = options.pattern ?? null;
    this.timezone = options.timezone;
    this.customJobOptions = options.customJobOptions;
  }

  public abstract run(payload: unknown): Promise<unknown>;
}

/**
 * Scheduler-side relay task: applies the payload's catch-up policy, then
 * re-publishes the fire onto the bus (`lumi.scheduler.fire:<name>`) for a
 * worker to execute via `registerTaskFireHandler`. Every task is this shape -
 * the Discord-touching work never lives in the task itself - so subclasses
 * declare nothing but the schedule (via the constructor) and payload type:
 * `export class FooTask extends RelayTask<"foo"> {}`.
 */
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

/**
 * Imports every `scheduled-tasks/*.ts` file under a module directory and
 * registers each exported task class. Only the scheduler process calls this;
 * other processes enqueue through the producer and never run tasks.
 */
export async function loadScheduledTasks(moduleDir: string): Promise<number> {
  const dir = join(moduleDir, "scheduled-tasks");
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
