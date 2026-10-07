import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";
import { QueuePriority } from "#lib/schedule-task.js";

export interface GdprExportPayload extends CatchUpMeta {
  jobId: string;
}

export class GdprExportTask extends RelayTask<"gdpr-export"> {
  public constructor() {
    super({
      name: "gdpr-export",
      customJobOptions: { priority: QueuePriority.UTILITY }
    });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "gdpr-export": GdprExportPayload;
  }
}
