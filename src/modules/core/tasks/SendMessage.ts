import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export class SendMessageTask extends RelayTask<"send-message"> {
  public constructor() {
    super({ name: "send-message" });
  }
}
