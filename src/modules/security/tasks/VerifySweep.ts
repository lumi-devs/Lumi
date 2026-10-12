import { RelayTask } from "#src/lib/scheduler/Tasks.js";
import { QueuePriority } from "#src/lib/scheduler/Schedule.js";

export class VerifySweepTask extends RelayTask<"security-verify-sweep"> {
  public constructor() {
    super({
      name: "security-verify-sweep",
      pattern: "*/2 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
