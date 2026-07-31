import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#lib/scheduled-tasks.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "security-verify-sweep",
  pattern: "*/2 * * * *",
})
export class VerifySweepTask extends RelayTask<"security-verify-sweep"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "security-verify-sweep": Record<string, never>;
  }
}
