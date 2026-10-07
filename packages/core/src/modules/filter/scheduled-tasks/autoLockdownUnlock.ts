import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface AutoLockdownUnlockPayload extends CatchUpMeta {
  guildId: string;
}

export class AutoLockdownUnlockTask extends RelayTask<"filter-auto-lockdown-unlock"> {
  public constructor() {
    super({ name: "filter-auto-lockdown-unlock" });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "filter-auto-lockdown-unlock": AutoLockdownUnlockPayload;
  }
}
