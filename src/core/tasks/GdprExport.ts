import { RelayTask } from "#src/lib/scheduler/Tasks.js";
import { QueuePriority } from "#src/lib/scheduler/Schedule.js";

export class GdprExportTask extends RelayTask<"gdpr-export"> {
  public constructor() {
    super({
      name: "gdpr-export",
      customJobOptions: { priority: QueuePriority.UTILITY }
    });
  }
}
