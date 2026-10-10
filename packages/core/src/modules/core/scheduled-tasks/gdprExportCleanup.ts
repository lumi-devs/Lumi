import { RelayTask } from "@lumi/lib/scheduler/tasks.js";
import { QueuePriority } from "@lumi/lib/scheduler/schedule.js";

export class GdprExportCleanupTask extends RelayTask<"gdpr-export-cleanup"> {
  public constructor() {
    super({
      name: "gdpr-export-cleanup",
      pattern: "0 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
