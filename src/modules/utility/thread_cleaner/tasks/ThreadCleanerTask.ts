import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { getExpiredThreads, untrackThread } from "../data.js";

@ApplyOptions<ScheduledTask.Options>({
  name: "thread-cleaner-task",
  pattern: "*/15 * * * *", // Every 15 minutes
})
export class ThreadCleanerTask extends ScheduledTask {
  public async run() {
    this.container.logger.info("[ThreadCleanerTask] Starting cleanup run...");

    const expiredThreads = await getExpiredThreads();
    if (expiredThreads.length === 0) {
      this.container.logger.info(
        "[ThreadCleanerTask] No expired threads to process.",
      );
      return;
    }

    this.container.logger.info(
      `[ThreadCleanerTask] Found ${expiredThreads.length} expired threads to process.`,
    );

    for (const tracked of expiredThreads) {
      try {
        const guild = await this.container.client.guilds
          .fetch(tracked.guildId)
          .catch(() => null);
        if (!guild) {
          await untrackThread(tracked.threadId);
          continue;
        }

        const thread = await guild.channels
          .fetch(tracked.threadId)
          .catch(() => null);

        // If thread doesn't exist anymore, untrack it
        if (!thread || !thread.isThread()) {
          await untrackThread(tracked.threadId);
          continue;
        }

        // If thread is already archived, untrack it
        if (thread.archived) {
          await untrackThread(tracked.threadId);
          continue;
        }

        const action =
          ((await this.container.db.getModuleConfig(
            guild.id,
            "thread_cleaner",
            "action",
          )) as "archive" | "lock" | null) ?? "archive";

        if (action === "archive") {
          await thread.setArchived(
            true,
            "Automatic cleanup due to inactivity.",
          );
          this.container.logger.info(
            `[ThreadCleanerTask] Archived thread ${thread.id} in guild ${guild.id}.`,
          );
        } else if (action === "lock") {
          await thread.setLocked(true, "Automatic cleanup due to inactivity.");
          this.container.logger.info(
            `[ThreadCleanerTask] Locked thread ${thread.id} in guild ${guild.id}.`,
          );
        }

        await untrackThread(tracked.threadId);
      } catch (error) {
        this.container.logger.error(
          `[ThreadCleanerTask] Failed to process thread ${tracked.threadId}`,
          error,
        );
        // Do not untrack if we failed, so we can retry on the next run.
      }
    }
    this.container.logger.info("[ThreadCleanerTask] Finished cleanup run.");
  }
}
