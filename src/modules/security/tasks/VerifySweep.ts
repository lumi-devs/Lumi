import { RelayTask } from "@scheduler/Tasks.js";
import { QueuePriority } from "@scheduler/Schedule.js";

export class VerifySweepTask extends RelayTask<"security-verify-sweep"> {
  public constructor() {
    super({
      name: "security-verify-sweep",
      pattern: "*/2 * * * *",
      customJobOptions: { priority: QueuePriority.CLEANUP }
    });
  }
}
