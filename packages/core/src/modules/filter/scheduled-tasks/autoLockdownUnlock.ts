import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface AutoLockdownUnlockPayload extends CatchUpMeta {
  guildId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "filter-auto-lockdown-unlock" })
export class AutoLockdownUnlockTask extends RelayTask<"filter-auto-lockdown-unlock"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "filter-auto-lockdown-unlock": AutoLockdownUnlockPayload;
  }
}
