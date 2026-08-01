import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask } from "#lib/scheduled-tasks.js";
import type { OutboundSendPayload } from "#lib/outbound/send-queue.js";

@ApplyOptions<ScheduledTask.Options>({ name: "send-message" })
export class SendMessageTask extends RelayTask<"send-message"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "send-message": OutboundSendPayload;
  }
}
