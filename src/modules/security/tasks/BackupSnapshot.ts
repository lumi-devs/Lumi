import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export class BackupSnapshotTask extends RelayTask<"security-backup-snapshot"> {
  public constructor() {
    super({
      name: "security-backup-snapshot",
      pattern: "0 * * * *"
    });
  }
}
