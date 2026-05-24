import { container } from "@sapphire/framework";
import type { TrackedThread } from "@prisma/client";

/**
 * Creates a record to track a new thread for cleanup.
 * @param threadId The ID of the thread to track.
 * @param guildId The ID of the guild the thread is in.
 * @param channelId The ID of the parent channel.
 * @param archiveAt The timestamp when the thread should be archived.
 */
export async function trackThread(
  threadId: string,
  guildId: string,
  channelId: string,
  archiveAt: Date,
): Promise<void> {
  await container.prisma.trackedThread.create({
    data: {
      threadId,
      guildId,
      channelId,
      archiveAt,
    },
  });
}

/**
 * Removes a thread from the tracking database.
 * @param threadId The ID of the thread to untrack.
 */
export async function untrackThread(threadId: string): Promise<void> {
  await container.prisma.trackedThread
    .delete({
      where: { threadId },
    })
    .catch(() => {
      // Gracefully fail if the thread is already untracked.
    });
}

/**
 * Retrieves all tracked threads that have passed their archival timestamp.
 * @returns A promise that resolves to an array of expired tracked threads.
 */
export async function getExpiredThreads(): Promise<TrackedThread[]> {
  return container.prisma.trackedThread.findMany({
    where: {
      archiveAt: {
        lte: new Date(),
      },
    },
  });
}
