import { RelayTask } from "#lib/scheduled-tasks.js";

export class FlushLogsTask extends RelayTask<"flush-logs"> {
  public constructor() {
    super({
      name: "flush-logs",
      interval: 5000
    });
  }
}
