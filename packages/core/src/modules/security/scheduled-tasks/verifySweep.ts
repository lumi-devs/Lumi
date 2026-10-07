import { RelayTask } from "#lib/scheduled-tasks.js";
import { QueuePriority } from "#lib/schedule-task.js";

export class VerifySweepTask extends RelayTask<"security-verify-sweep"> {
  public constructor() {
    super({
      name: "security-verify-sweep",
      pattern: "*/2 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "security-verify-sweep": Record<string, never>;
  }
}
