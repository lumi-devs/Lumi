import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface ModLiftPayload extends CatchUpMeta {
  caseId: number;
}

@ApplyOptions<ScheduledTask.Options>({ name: "mod-lift" })
export class ModLiftTask extends RelayTask<"mod-lift"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "mod-lift": ModLiftPayload;
  }
}
