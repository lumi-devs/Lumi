import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#lib/scheduled-tasks.js";
import { AddonRelayTaskName, type AddonRelayPayload } from "#lib/addon-sandbox/relay-task.js";

@ApplyOptions<ScheduledTask.Options>({ name: AddonRelayTaskName })
export class AddonRelayScheduledTask extends RelayTask<typeof AddonRelayTaskName> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "addon-relay": AddonRelayPayload;
  }
}
