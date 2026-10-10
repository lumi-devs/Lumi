import { RelayTask, type CatchUpMeta } from "@lumi/lib/scheduler/tasks.js";

export interface AutoLockdownUnlockPayload extends CatchUpMeta {
  guildId: string;
}

export class AutoLockdownUnlockTask extends RelayTask<"filter-auto-lockdown-unlock"> {
  public constructor() {
    super({ name: "filter-auto-lockdown-unlock" });
  }
}
