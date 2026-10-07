import { RelayTask } from "#lib/scheduled-tasks.js";
import type { OutboundSendPayload } from "#lib/outbound/send-queue.js";

export class SendMessageTask extends RelayTask<"send-message"> {
  public constructor() {
    super({ name: "send-message" });
  }
}

declare module "#lib/types/common.js" {
  interface ScheduledTasks {
    "send-message": OutboundSendPayload;
  }
}
