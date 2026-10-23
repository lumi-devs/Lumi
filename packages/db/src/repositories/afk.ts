import type { AfkEntry } from "../../generated/client/index.js";
import { TTL } from "@lumi/redis";
import { Repository, type RepositoryDeps } from "./base.ts";

export class AfkRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  public findEntry(guildId: string, userId: string): Promise<AfkEntry | null> {
    return this.deps.caches.afk.getOrLoad(
      this.deps.keys.afk(guildId, userId),
      TTL.afk * 1_000,
      () => this.reader.afkEntry.findUnique({
        where: { userId_guildId: { userId, guildId } },
      }),
      { negativeTtlMs: TTL.afkNegative * 1_000 },
    );
  }

  public async findEntries(guildId: string, userIds: readonly string[]): Promise<AfkEntry[]> {
    const unique = [...new Set(userIds)];
    const entries = await Promise.all(unique.map((userId) => this.findEntry(guildId, userId)));
    return entries.filter((entry): entry is AfkEntry => entry !== null);
  }

  public async upsertEntry(guildId: string, userId: string, reason: string): Promise<AfkEntry> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });
    const entry = await this.prisma.afkEntry.upsert({
      where: { userId_guildId: { userId, guildId } },
      update: { reason, since: new Date() },
      create: { userId, guildId, reason },
    });
    await this.invalidate(this.deps.keys.afk(guildId, userId));
    return entry;
  }

  public async deleteEntry(guildId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.afkEntry.deleteMany({ where: { guildId, userId } });
    await this.invalidate(this.deps.keys.afk(guildId, userId));
    return result.count > 0;
  }

  public async deleteAllForUser(userId: string): Promise<number> {
    const rows = await this.prisma.afkEntry.findMany({
      where: { userId },
      select: { guildId: true },
    });
    if (rows.length === 0) return 0;
    const result = await this.prisma.afkEntry.deleteMany({ where: { userId } });
    await this.invalidate(...rows.map((row) => this.deps.keys.afk(row.guildId, userId)));
    return result.count;
  }

  public async listForGuild(guildId: string, limit = 1_000): Promise<AfkEntry[]> {
    return this.reader.afkEntry.findMany({
      where: { guildId },
      orderBy: { since: "asc" },
      take: limit,
    });
  }

  public async countForGuild(guildId: string): Promise<number> {
    return this.reader.afkEntry.count({ where: { guildId } });
  }

  public async findAllForUser(userId: string): Promise<AfkEntry[]> {
    return this.reader.afkEntry.findMany({ where: { userId } });
  }

  public async *iterateForGuild(guildId: string, pageSize = 1_000): AsyncGenerator<AfkEntry[]> {
    let cursor: string | undefined;
    for (;;) {
      const page = await this.reader.afkEntry.findMany({
        where: { guildId },
        orderBy: { userId: "asc" },
        take: pageSize,
        ...(cursor
          ? { cursor: { userId_guildId: { userId: cursor, guildId } }, skip: 1 }
          : {}),
      });
      if (page.length === 0) return;
      yield page;
      if (page.length < pageSize) return;
      cursor = page[page.length - 1]!.userId;
    }
  }

  public async *iterateAll(pageSize = 1_000): AsyncGenerator<AfkEntry[]> {
    let cursor: { userId: string; guildId: string } | undefined;
    for (;;) {
      const page = await this.reader.afkEntry.findMany({
        orderBy: [{ userId: "asc" }, { guildId: "asc" }],
        take: pageSize,
        ...(cursor ? { cursor: { userId_guildId: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) return;
      yield page;
      if (page.length < pageSize) return;
      const last = page[page.length - 1]!;
      cursor = { userId: last.userId, guildId: last.guildId };
    }
  }
}
