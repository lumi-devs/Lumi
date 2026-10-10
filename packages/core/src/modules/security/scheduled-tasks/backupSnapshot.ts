import { RelayTask } from "@lumi/lib/scheduler/tasks.js";

export class BackupSnapshotTask extends RelayTask<"security-backup-snapshot"> {
  public constructor() {
    super({
      name: "security-backup-snapshot",
      pattern: "0 * * * *"
    });
  }
}
