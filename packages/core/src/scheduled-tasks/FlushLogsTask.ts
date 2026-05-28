import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "flush-logs",
  interval: 5000,
})
export class FlushLogsTask extends ScheduledTask {
  // Scheduler-side: relay onto the bus. Workers (unicast — exactly one drains
  // the global Redis audit-log queue per tick) run `handleFlushLogsFire`.
  public async run(): Promise<void> {
    await publishTaskFire("flush-logs", {});
  }
}
