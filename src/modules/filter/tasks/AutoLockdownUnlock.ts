import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export interface AutoLockdownUnlockPayload {
  guildId: string;
}

export class AutoLockdownUnlockTask extends RelayTask<"filter-auto-lockdown-unlock"> {
  public constructor() {
    super({ name: "filter-auto-lockdown-unlock" });
  }
}
