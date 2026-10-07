import { RelayTask } from "#lib/scheduled-tasks.js";
import { QueuePriority } from "#lib/schedule-task.js";

export class GdprExportCleanupTask extends RelayTask<"gdpr-export-cleanup"> {
  public constructor() {
    super({
      name: "gdpr-export-cleanup",
      pattern: "0 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "gdpr-export-cleanup": Record<string, never>;
  }
}
