import { RelayTask } from "@lumi/lib/scheduler/tasks.js";
import { QueuePriority } from "@lumi/lib/scheduler/schedule.js";

export class VerifySweepTask extends RelayTask<"security-verify-sweep"> {
  public constructor() {
    super({
      name: "security-verify-sweep",
      pattern: "*/2 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
