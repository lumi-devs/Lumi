import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";

export interface AfkDeleteMessagePayload extends CatchUpMeta {
  channelId: string;
  messageId: string;
  /** If set, clear the AFK mention list for this user in this guild after deleting. */
  clearMentions?: { guildId: string; userId: string };
}

// Scheduler-side relay; the actual delete happens on a worker
// (see afk/lib/delete-handler.ts), which has the Discord client.
@ApplyOptions<ScheduledTask.Options>({ name: "afk-delete-message" })
export class AfkDeleteMessageTask extends RelayTask<"afk-delete-message"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "afk-delete-message": AfkDeleteMessagePayload;
  }
}
