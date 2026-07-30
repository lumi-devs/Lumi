import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface WarnDecayPayload extends CatchUpMeta {}

@ApplyOptions<ScheduledTask.Options>({ name: "warn-decay", pattern: "0 0 * * *" })
export class WarnDecayTask extends RelayTask<"warn-decay"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "warn-decay": WarnDecayPayload;
  }
}
