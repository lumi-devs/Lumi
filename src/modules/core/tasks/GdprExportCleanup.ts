import { RelayTask } from "@scheduler/Tasks.js";
import { QueuePriority } from "@scheduler/Schedule.js";

export class GdprExportCleanupTask extends RelayTask<"gdpr-export-cleanup"> {
  public constructor() {
    super({
      name: "gdpr-export-cleanup",
      pattern: "0 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
