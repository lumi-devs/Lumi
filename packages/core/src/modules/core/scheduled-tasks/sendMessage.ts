import { RelayTask } from "#lib/scheduler/tasks.js";

export class SendMessageTask extends RelayTask<"send-message"> {
  public constructor() {
    super({ name: "send-message" });
  }
}
