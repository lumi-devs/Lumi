// Worker-side fire handler for the periodic `thread-cleaner-task` sweep.

import { container } from "@sapphire/framework";
import { getExpiredThreads, untrackThread } from "../data.js";

export async function handleThreadCleanerFire(): Promise<void> {
  container.logger.info("[ThreadCleanerTask] Starting cleanup run...");

  const expiredThreads = await getExpiredThreads();
  if (expiredThreads.length === 0) {
    container.logger.info("[ThreadCleanerTask] No expired threads to process.");
    return;
  }

  container.logger.info(
    `[ThreadCleanerTask] Found ${expiredThreads.length} expired threads to process.`,
  );

  for (const tracked of expiredThreads) {
    try {
      const guild = await container.client.guilds
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
        ((await container.db.config.getModuleConfig(
          guild.id,
          "thread_cleaner",
          "action",
        )) as "archive" | "lock" | null) ?? "archive";

      if (action === "archive") {
        await thread.setArchived(true, "Automatic cleanup due to inactivity.");
        container.logger.info(
          `[ThreadCleanerTask] Archived thread ${thread.id} in guild ${guild.id}.`,
        );
      } else if (action === "lock") {
        await thread.setLocked(true, "Automatic cleanup due to inactivity.");
        container.logger.info(
          `[ThreadCleanerTask] Locked thread ${thread.id} in guild ${guild.id}.`,
        );
      }

      await untrackThread(tracked.threadId);
    } catch (error) {
      container.logger.error(
        `[ThreadCleanerTask] Failed to process thread ${tracked.threadId}`,
        error,
      );
      // Do not untrack if we failed, so we can retry on the next run.
    }
  }
  container.logger.info("[ThreadCleanerTask] Finished cleanup run.");
}
