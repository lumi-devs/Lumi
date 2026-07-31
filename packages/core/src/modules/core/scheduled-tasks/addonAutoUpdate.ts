import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#lib/scheduled-tasks.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "addon-auto-update",
  pattern: "*/15 * * * *",
})
export class AddonAutoUpdateTask extends RelayTask<"addon-auto-update"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "addon-auto-update": Record<string, never>;
  }
}
