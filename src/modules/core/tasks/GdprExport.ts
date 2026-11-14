import { RelayTask } from "@scheduler/Tasks.js";
import { QueuePriority } from "@scheduler/Schedule.js";

export class GdprExportTask extends RelayTask<"gdpr-export"> {
  public constructor() {
    super({
      name: "gdpr-export",
      customJobOptions: { priority: QueuePriority.UTILITY }
    });
  }
}
