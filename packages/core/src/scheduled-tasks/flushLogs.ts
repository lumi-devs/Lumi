import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#lib/scheduled-tasks.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "flush-logs",
  interval: 5000,
})
export class FlushLogsTask extends RelayTask<"flush-logs"> {}
