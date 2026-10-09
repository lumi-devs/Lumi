import { RelayTask } from "#lib/scheduler/tasks.js";
import { AddonRelayTaskName } from "#lib/addon-sandbox/relay-task.js";

export class AddonRelayScheduledTask extends RelayTask<typeof AddonRelayTaskName> {
  public constructor() {
    super({ name: AddonRelayTaskName });
  }
}
