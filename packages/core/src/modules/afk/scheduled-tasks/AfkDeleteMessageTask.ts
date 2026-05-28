import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

export interface AfkDeleteMessagePayload extends CatchUpMeta {
  channelId: string;
  messageId: string;
  /** If set, clear the AFK mention list for this user in this guild after deleting. */
  clearMentions?: { guildId: string; userId: string };
}

@ApplyOptions<ScheduledTask.Options>({ name: "afk-delete-message" })
export class AfkDeleteMessageTask extends ScheduledTask<"afk-delete-message"> {
  // Scheduler-side: relay onto the bus; the actual delete happens on a worker
  // (see afk/lib/delete-handler.ts), which has the Discord client.
  public async run(payload: AfkDeleteMessagePayload): Promise<void> {
    if (!shouldRunNow("afk-delete-message", payload)) return;
    await publishTaskFire("afk-delete-message", payload);
  }
}
