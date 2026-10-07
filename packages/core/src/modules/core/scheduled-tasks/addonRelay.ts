import { RelayTask } from "#lib/scheduled-tasks.js";
import { AddonRelayTaskName, type AddonRelayPayload } from "#lib/addon-sandbox/relay-task.js";

export class AddonRelayScheduledTask extends RelayTask<typeof AddonRelayTaskName> {
  public constructor() {
    super({ name: AddonRelayTaskName });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "addon-relay": AddonRelayPayload;
  }
}
