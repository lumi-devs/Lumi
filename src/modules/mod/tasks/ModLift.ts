import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export interface ModLiftPayload {
  caseId: number;
}

export class ModLiftTask extends RelayTask<"mod-lift"> {
  public constructor() {
    super({ name: "mod-lift" });
  }
}
