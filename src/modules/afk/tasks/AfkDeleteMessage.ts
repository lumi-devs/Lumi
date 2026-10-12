import { RelayTask, type CatchUpMeta } from "#src/lib/scheduler/Tasks.js";

export interface AfkDeleteMessagePayload extends CatchUpMeta {
  channelId: string;
  messageId: string;

  clearMentions?: { guildId: string; userId: string };
}

export class AfkDeleteMessageTask extends RelayTask<"afk-delete-message"> {
  public constructor() {
    super({ name: "afk-delete-message" });
  }
}
