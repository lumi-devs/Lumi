import { RelayTask, type CatchUpMeta } from "@lumi/lib/scheduler/tasks.js";

export interface WarnDecayPayload extends CatchUpMeta {}

export class WarnDecayTask extends RelayTask<"warn-decay"> {
  public constructor() {
    super({
      name: "warn-decay",
      pattern: "0 0 * * *"
    });
  }
}
