import type { TrackedThread } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { Repository } from "#root/prisma/repositories/Repository.js";

/**
 * Tracked threads (`TrackedThread`), owned by the `thread_cleaner` module —
 * threads scheduled to be archived once they pass `archiveAt`.
 */
export class ThreadRepository extends Repository {
  public async track(
    threadId: string,
    guildId: string,
    channelId: string,
    archiveAt: Date,
  ): Promise<void> {
    await this.prisma.trackedThread.create({
      data: { threadId, guildId, channelId, archiveAt },
    });
  }

  /** Untracks a thread; silently ignores an already-removed record. */
  public async untrack(threadId: string): Promise<void> {
    await this.prisma.trackedThread.delete({ where: { threadId } }).catch(
      (err: unknown) => {
        // P2025 = record not found — already untracked, nothing to do.
        // Re-throw anything else (connection errors, constraint violations, …).
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== "P2025"
        ) {
          throw err;
        }
      },
    );
  }

  /** Tracked threads whose archival timestamp has passed. */
  public findExpired(): Promise<TrackedThread[]> {
    return this.prisma.trackedThread.findMany({
      where: { archiveAt: { lte: new Date() } },
    });
  }
}
