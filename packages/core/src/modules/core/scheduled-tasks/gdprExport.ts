import { RelayTask } from "#lib/scheduled-tasks.js";
import { QueuePriority } from "#lib/schedule-task.js";

export class GdprExportTask extends RelayTask<"gdpr-export"> {
  public constructor() {
    super({
      name: "gdpr-export",
      customJobOptions: { priority: QueuePriority.UTILITY }
    });
  }
}
