import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "thread-cleaner-task",
  pattern: "*/15 * * * *", // Every 15 minutes
})
export class ThreadCleanerTask extends ScheduledTask {
  // Scheduler-side: relay onto the bus. The tracked-thread sweep iterates a
  // DB-backed list (no per-worker cache); unicast is correct so a single
  // worker handles each tick. See thread_cleaner/lib/cleanup-handler.ts.
  public async run(): Promise<void> {
    await publishTaskFire("thread-cleaner-task", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "thread-cleaner-task": Record<string, never>;
  }
}
