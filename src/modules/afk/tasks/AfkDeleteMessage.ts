import { RelayTask } from "#src/lib/scheduler/Tasks.js";

export interface AfkDeleteMessagePayload {
  channelId: string;
  messageId: string;
  clearMentions?: { guildId: string; userId: string };
  scheduledFor?: number;
  catchUp?: boolean;
}

export class AfkDeleteMessageTask extends RelayTask<"afk-delete-message"> {
  public constructor() {
    super({ name: "afk-delete-message" });
  }
}
