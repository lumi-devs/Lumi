import { RelayTask } from "#lib/scheduler/tasks.js";
import { QueuePriority } from "#lib/scheduler/schedule.js";

export class GdprExportCleanupTask extends RelayTask<"gdpr-export-cleanup"> {
  public constructor() {
    super({
      name: "gdpr-export-cleanup",
      pattern: "0 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
