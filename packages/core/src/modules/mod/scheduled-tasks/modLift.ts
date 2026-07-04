import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";

// Lifts must catch up after downtime (an expired mute/ban has to be released),
// so this payload leaves `catchUp` at its default of `true`.
export interface ModLiftPayload extends CatchUpMeta {
  caseId: number;
}

// Scheduler-side relay; the Discord-touching work lives in `handleModLiftFire`
// (mod/lib/lift-handler.ts), registered on worker/monolith roles via
// `registerTaskFireHandler`.
@ApplyOptions<ScheduledTask.Options>({ name: "mod-lift" })
export class ModLiftTask extends RelayTask<"mod-lift"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "mod-lift": ModLiftPayload;
  }
}
