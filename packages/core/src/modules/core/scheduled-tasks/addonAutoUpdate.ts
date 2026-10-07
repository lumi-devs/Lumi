import { RelayTask } from "#lib/scheduled-tasks.js";

export class AddonAutoUpdateTask extends RelayTask<"addon-auto-update"> {
  public constructor() {
    super({
      name: "addon-auto-update",
      pattern: "*/15 * * * *"
    });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "addon-auto-update": Record<string, never>;
  }
}
