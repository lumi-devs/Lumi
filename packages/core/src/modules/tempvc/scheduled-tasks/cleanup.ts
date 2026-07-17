import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface TempVcCleanupPayload extends CatchUpMeta {
  guildId: string;
  channelId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "tempvc-cleanup" })
export class TempVcCleanupTask extends RelayTask<"tempvc-cleanup"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "tempvc-cleanup": TempVcCleanupPayload;
  }
}
