import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface ModLiftPayload extends CatchUpMeta {
  caseId: number;
}

export class ModLiftTask extends RelayTask<"mod-lift"> {
  public constructor() {
    super({ name: "mod-lift" });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "mod-lift": ModLiftPayload;
  }
}
