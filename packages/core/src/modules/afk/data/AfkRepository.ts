import type { AfkEntry } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/**
 * AFK entries (`AfkEntry`), owned by the `afk` module.  Pure persistence - the
 * module's `data/afk.ts` layers its own Redis cache (AfkKeys/AfkTTL) on top.
 */
export class AfkRepository extends Repository {
  public findEntry(guildId: string, userId: string): Promise<AfkEntry | null> {
    return this.prisma.afkEntry.findUnique({
      where: { userId_guildId: { userId, guildId } },
    });
  }

  public findEntries(guildId: string, userIds: string[]): Promise<AfkEntry[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.afkEntry.findMany({
      where: {
        guildId,
        userId: { in: userIds },
      },
    });
  }

  public async upsertEntry(
    guildId: string,
    userId: string,
    reason: string,
  ): Promise<AfkEntry> {
    await this.db.ensureGuild(guildId);
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

  /**
   * Every AFK entry, in keyset-paginated batches. The stale sweep has to see
   * entries whose guild the bot has since left, so it cannot be narrowed to the
   * cached guild set - pagination is what keeps it from loading the whole table.
   */
  public async *iterateAll(pageSize = 1_000): AsyncGenerator<AfkEntry[]> {
    let cursor: { userId: string; guildId: string } | undefined;

    for (;;) {
      const page = await this.reader.afkEntry.findMany({
        orderBy: [{ userId: "asc" }, { guildId: "asc" }],
        take: pageSize,
        ...(cursor === undefined
          ? {}
          : { cursor: { userId_guildId: cursor }, skip: 1 }),
      });

      if (page.length === 0) return;
      yield page;
      if (page.length < pageSize) return;
      const last = page[page.length - 1]!;
      cursor = { userId: last.userId, guildId: last.guildId };
    }
  }

  public findForGuild(guildId: string): Promise<AfkEntry[]> {
    return this.prisma.afkEntry.findMany({ where: { guildId } });
  }

  /**
   * Every AFK entry for a user across every guild, keyset-paginated - a GDPR
   * export must see the complete set, but a user can have at most one entry
   * per guild the bot shares with them, which for a popular user can still
   * span thousands of rows.
   */
  public async findAllForUser(userId: string, pageSize = 1_000): Promise<AfkEntry[]> {
    const entries: AfkEntry[] = [];
    let cursor: string | undefined;

    for (;;) {
      const page = await this.prisma.afkEntry.findMany({
        where: { userId },
        orderBy: { guildId: "asc" },
        take: pageSize,
        ...(cursor === undefined
          ? {}
          : { cursor: { userId_guildId: { userId, guildId: cursor } }, skip: 1 }),
      });

      entries.push(...page);
      if (page.length < pageSize) return entries;
      cursor = page[page.length - 1]!.guildId;
    }
  }

  public countAll(): Promise<number> {
    return this.prisma.afkEntry.count();
  }
}
