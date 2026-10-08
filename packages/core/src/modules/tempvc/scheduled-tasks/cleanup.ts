import { RelayTask, type CatchUpMeta } from "#lib/scheduler/tasks.js";

export interface TempVcCleanupPayload extends CatchUpMeta {
  guildId: string;
  channelId: string;
}

export class TempVcCleanupTask extends RelayTask<"tempvc-cleanup"> {
  public constructor() {
    super({ name: "tempvc-cleanup" });
  }
}
