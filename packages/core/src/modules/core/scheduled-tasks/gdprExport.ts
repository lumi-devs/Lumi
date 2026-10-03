import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";
import { QueuePriority } from "#lib/schedule-task.js";

export interface GdprExportPayload extends CatchUpMeta {
  jobId: string;
}

@ApplyOptions<ScheduledTask.Options>({
  name: "gdpr-export",
  customJobOptions: { priority: QueuePriority.UTILITY },
})
export class GdprExportTask extends RelayTask<"gdpr-export"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "gdpr-export": GdprExportPayload;
  }
}
