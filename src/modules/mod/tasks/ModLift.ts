import { RelayTask, type CatchUpMeta } from "#src/lib/scheduler/Tasks.js";

export interface ModLiftPayload extends CatchUpMeta {
  caseId: number;
}

export class ModLiftTask extends RelayTask<"mod-lift"> {
  public constructor() {
    super({ name: "mod-lift" });
  }
}
