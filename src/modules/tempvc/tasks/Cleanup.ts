import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export interface TempVcCleanupPayload {
  guildId: string;
  channelId: string;
}

export class TempVcCleanupTask extends RelayTask<"tempvc-cleanup"> {
  public constructor() {
    super({ name: "tempvc-cleanup" });
  }
}
