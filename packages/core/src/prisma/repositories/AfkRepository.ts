import type { AfkEntry } from "@prisma/client";
import { Repository } from "#root/prisma/repositories/Repository.js";

/**
 * AFK entries (`AfkEntry`), owned by the `afk` module.  Pure persistence — the
 * module's `data/afk.ts` layers its own Redis cache (AfkKeys/AfkTTL) on top.
 */
export class AfkRepository extends Repository {
  public findEntry(guildId: string, userId: string): Promise<AfkEntry | null> {
    return this.prisma.afkEntry.findUnique({
      where: { userId_guildId: { userId, guildId } },
    });
  }

  public upsertEntry(
    guildId: string,
    userId: string,
    reason: string,
  ): Promise<AfkEntry> {
    return this.prisma.afkEntry.upsert({
      where: { userId_guildId: { userId, guildId } },
      update: { reason, since: new Date() },
      create: { userId, guildId, reason },
    });
  }

  /** Deletes one entry; throws (Prisma P2025) if it does not exist. */
  public async deleteEntry(guildId: string, userId: string): Promise<void> {
    await this.prisma.afkEntry.delete({
      where: { userId_guildId: { userId, guildId } },
    });
  }

  /** Deletes every entry for a user across all guilds; returns the count. */
  public async deleteAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.afkEntry.deleteMany({
      where: { userId },
    });
    return count;
  }

  public findAll(): Promise<AfkEntry[]> {
    return this.prisma.afkEntry.findMany();
  }

  public findForGuild(guildId: string): Promise<AfkEntry[]> {
    return this.prisma.afkEntry.findMany({ where: { guildId } });
  }

  public countAll(): Promise<number> {
    return this.prisma.afkEntry.count();
  }
}
