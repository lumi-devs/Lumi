import { RelayTask } from "#lib/scheduled-tasks.js";

export class BackupSnapshotTask extends RelayTask<"security-backup-snapshot"> {
  public constructor() {
    super({
      name: "security-backup-snapshot",
      pattern: "0 * * * *"
    });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "security-backup-snapshot": Record<string, never>;
  }
}
