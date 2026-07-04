import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";

// Cleanup must catch up after downtime (an empty channel left behind should still
// be removed), so this payload leaves `catchUp` at its default of `true`.
export interface TempVcCleanupPayload extends CatchUpMeta {
  guildId: string;
  channelId: string;
}

// Scheduler-side relay; the actual `TempVcService.runCleanup` (channel delete +
// record removal) runs on a worker that has the service + Discord client
// (see tempvc/lib/cleanup-handler.ts).
@ApplyOptions<ScheduledTask.Options>({ name: "tempvc-cleanup" })
export class TempVcCleanupTask extends RelayTask<"tempvc-cleanup"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "tempvc-cleanup": TempVcCleanupPayload;
  }
}
