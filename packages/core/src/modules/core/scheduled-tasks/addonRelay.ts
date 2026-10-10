import { RelayTask } from "@lumi/lib/scheduler/tasks.js";
import { AddonRelayTaskName } from "@lumi/lib/addon-sandbox/isolate/relay-task.js";

export class AddonRelayScheduledTask extends RelayTask<typeof AddonRelayTaskName> {
  public constructor() {
    super({ name: AddonRelayTaskName });
  }
}
