import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface AfkDeleteMessagePayload extends CatchUpMeta {
  channelId: string;
  messageId: string;
  /** If set, clear the AFK mention list for this user in this guild after deleting. */
  clearMentions?: { guildId: string; userId: string };
}

export class AfkDeleteMessageTask extends RelayTask<"afk-delete-message"> {
  public constructor() {
    super({ name: "afk-delete-message" });
  }
}
