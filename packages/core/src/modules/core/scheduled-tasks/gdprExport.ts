import { RelayTask } from "#lib/scheduler/tasks.js";
import { QueuePriority } from "#lib/scheduler/schedule.js";

export class GdprExportTask extends RelayTask<"gdpr-export"> {
  public constructor() {
    super({
      name: "gdpr-export",
      customJobOptions: { priority: QueuePriority.UTILITY }
    });
  }
}
