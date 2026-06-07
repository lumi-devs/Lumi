import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Lifts must catch up after downtime (an expired mute/ban has to be released),
// so this payload leaves `catchUp` at its default of `true`.
export interface ModLiftPayload extends CatchUpMeta {
  caseId: number;
}

@ApplyOptions<ScheduledTask.Options>({ name: "mod-lift" })
export class ModLiftTask extends ScheduledTask<"mod-lift"> {
  // Scheduler-side: just relay the fire onto the bus. The Discord-touching
  // work lives in `handleModLiftFire` (mod/lib/lift-handler.ts), registered
  // on worker/monolith roles via `registerTaskFireHandler`.
  public async run(payload: ModLiftPayload): Promise<void> {
    if (!shouldRunNow("mod-lift", payload)) return;
    await publishTaskFire("mod-lift", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "mod-lift": ModLiftPayload;
  }
}
