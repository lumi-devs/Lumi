import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#lib/scheduled-tasks.js";
import { QueuePriority } from "#lib/schedule-task.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "gdpr-export-cleanup",
  pattern: "0 * * * *",
  customJobOptions: { priority: QueuePriority.CLEANUP },
})
export class GdprExportCleanupTask extends RelayTask<"gdpr-export-cleanup"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "gdpr-export-cleanup": Record<string, never>;
  }
}
