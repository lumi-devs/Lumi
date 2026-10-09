import { RelayTask } from "#lib/scheduler/tasks.js";
import { QueuePriority } from "#lib/scheduler/schedule.js";

export class VerifySweepTask extends RelayTask<"security-verify-sweep"> {
  public constructor() {
    super({
      name: "security-verify-sweep",
      pattern: "*/2 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
