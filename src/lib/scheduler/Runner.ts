import { container } from "#src/lib/Services.js";
import { getScheduledTask, repeatedScheduledTasks } from "#src/lib/scheduler/Tasks.js";
import type { ScheduleOptions } from "#src/lib/scheduler/Schedule.js";
import { resolveTaskRef } from "#src/lib/scheduler/Schedule.js";

export interface TaskQueue {
  create(task: string | { name: string; payload?: unknown }, options?: ScheduleOptions): Promise<any>;
  delete(id: string): Promise<any>;
  close(): Promise<void>;
}

export class ScheduledTaskRunner implements TaskQueue {
  readonly #intervals: Timer[] = [];
  readonly #timeouts = new Map<string, Timer>();

  public async create(
    task: string | { name: string; payload?: unknown },
    options?: ScheduleOptions,
  ): Promise<any> {
    const { name, payload } = resolveTaskRef(task);
    const delay = typeof options === "number" ? options : options?.delay;
    const interval = typeof options === "object" ? options?.interval : undefined;

    if (interval && interval > 0) {
      const timer = setInterval(() => {
        void this.execute(name, payload);
      }, interval);
      this.#intervals.push(timer);
      return { id: name };
    }

    if (delay && delay > 0) {
      const id = `${name}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
      const timer = setTimeout(() => {
        this.#timeouts.delete(id);
        void this.execute(name, payload);
      }, delay);
      this.#timeouts.set(id, timer);
      return { id };
    }

    queueMicrotask(() => {
      void this.execute(name, payload);
    });
    return { id: name };
  }

  public async createRepeated(): Promise<void> {
    const list = repeatedScheduledTasks();
    for (const task of list) {
      if (task.interval && task.interval > 0) {
        const timer = setInterval(() => {
          void this.execute(task.name, undefined);
        }, task.interval);
        this.#intervals.push(timer);
      }
    }
  }

  public async execute(name: string, payload: unknown): Promise<void> {
    const task = getScheduledTask(name);
    if (!task) return;
    try {
      await task.run(payload);
    } catch (err) {
      container.logger.error(`[Scheduler] Task '${name}' failed:`, err);
    }
  }

  public async delete(id: string): Promise<void> {
    const timer = this.#timeouts.get(id);
    if (timer) {
      clearTimeout(timer);
      this.#timeouts.delete(id);
    }
  }

  public async close(): Promise<void> {
    for (const t of this.#intervals) clearInterval(t);
    for (const t of this.#timeouts.values()) clearTimeout(t);
    this.#intervals.length = 0;
    this.#timeouts.clear();
  }
}
