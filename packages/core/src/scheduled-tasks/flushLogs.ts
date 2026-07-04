import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#core/lib/scheduled-tasks.js";

// Scheduler-side relay. Workers (unicast — exactly one drains the global Redis
// audit-log queue per tick) run `handleFlushLogsFire`. The payload type is
// registered in core/types/common.ts.
@ApplyOptions<ScheduledTask.Options>({
  name: "flush-logs",
  interval: 5000,
})
export class FlushLogsTask extends RelayTask<"flush-logs"> {}
