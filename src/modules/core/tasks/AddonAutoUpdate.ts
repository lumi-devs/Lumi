import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export class AddonAutoUpdateTask extends RelayTask<"addon-auto-update"> {
  public constructor() {
    super({
      name: "addon-auto-update",
      pattern: "*/15 * * * *"
    });
  }
}
