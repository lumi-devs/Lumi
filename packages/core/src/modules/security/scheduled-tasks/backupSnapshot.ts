import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#lib/scheduled-tasks.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "security-backup-snapshot",
  pattern: "0 * * * *",
})
export class BackupSnapshotTask extends RelayTask<"security-backup-snapshot"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "security-backup-snapshot": Record<string, never>;
  }
}
