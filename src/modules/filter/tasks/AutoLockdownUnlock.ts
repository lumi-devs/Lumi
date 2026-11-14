import { RelayTask, type CatchUpMeta } from "@scheduler/Tasks.js";

export interface AutoLockdownUnlockPayload extends CatchUpMeta {
  guildId: string;
}

export class AutoLockdownUnlockTask extends RelayTask<"filter-auto-lockdown-unlock"> {
  public constructor() {
    super({ name: "filter-auto-lockdown-unlock" });
  }
}
