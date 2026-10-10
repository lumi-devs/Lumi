import { RelayTask, type CatchUpMeta } from "@lumi/lib/scheduler/tasks.js";

export interface ModLiftPayload extends CatchUpMeta {
  caseId: number;
}

export class ModLiftTask extends RelayTask<"mod-lift"> {
  public constructor() {
    super({ name: "mod-lift" });
  }
}
