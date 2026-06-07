import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Cleanup must catch up after downtime (an empty channel left behind should still
// be removed), so this payload leaves `catchUp` at its default of `true`.
export interface TempVcCleanupPayload extends CatchUpMeta {
  guildId: string;
  channelId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "tempvc-cleanup" })
export class TempVcCleanupTask extends ScheduledTask<"tempvc-cleanup"> {
  // Scheduler-side: relay onto the bus. The actual `TempVcService.runCleanup`
  // (channel delete + record removal) runs on a worker that has the service +
  // Discord client (see tempvc/lib/cleanup-handler.ts).
  public async run(payload: TempVcCleanupPayload): Promise<void> {
    if (!shouldRunNow("tempvc-cleanup", payload)) return;
    await publishTaskFire("tempvc-cleanup", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "tempvc-cleanup": TempVcCleanupPayload;
  }
}
