import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export interface WarnDecayPayload {}

export class WarnDecayTask extends RelayTask<"warn-decay"> {
  public constructor() {
    super({
      name: "warn-decay",
      pattern: "0 0 * * *"
    });
  }
}
