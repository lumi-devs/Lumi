import type { Blocklist, IgnoreEntry } from "@prisma/client";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/**
 * Access control: the `Blocklist` (per-user, optionally per-guild) and
 * `IgnoreEntry` (per-channel/guild) tables, with their bespoke `"1"/"0"` Redis
 * caches.
 */
export class AccessRepository extends Repository {
  public async isUserBlocked(
    userId: string,
    guildId: string | null,
  ): Promise<boolean> {
    const gKey = RedisKeys.blocked(null, userId);
    const sKey = guildId ? RedisKeys.blocked(guildId, userId) : null;

    const [gCached, sCached] = await Promise.all([
      this.redis.get(gKey),
      sKey ? this.redis.get(sKey) : null,
    ]);

    if (gCached === "1" || sCached === "1") return true;
    if (gCached === "0" && (!sKey || sCached === "0")) return false;

    const blocks = await this.prisma.blocklist.findMany({
      where: { userId, OR: [{ guildId: null }, ...(guildId ? [{ guildId }] : [])] },
    });

    const gBlocked = blocks.some((b) => b.guildId === null);
    const sBlocked = guildId
      ? blocks.some((b) => b.guildId === guildId)
      : false;

    const pipe = this.redis.pipeline();
    pipe.setex(gKey, RedisTTL.blockedCache, gBlocked ? "1" : "0");
    if (sKey) pipe.setex(sKey, RedisTTL.blockedCache, sBlocked ? "1" : "0");
    await pipe.exec();

    return gBlocked || sBlocked;
  }

  public async getIgnoreStatus(guildId: string, channelId: string) {
    const gKey = RedisKeys.guildIgnored(guildId);
    const cKey = RedisKeys.channelIgnored(guildId, channelId);

    const [gCached, cCached] = await Promise.all([
      this.redis.get(gKey),
      this.redis.get(cKey),
    ]);

    if (gCached !== null && cCached !== null) {
      return { guild: gCached === "1", channel: cCached === "1" };
    }

    const rows = await this.prisma.ignoreEntry.findMany({
      where: { guildId, OR: [{ channelId: null }, { channelId }] },
    });

    const guild = rows.some((r) => r.channelId === null);
    const channel = rows.some((r) => r.channelId === channelId);

    const pipe = this.redis.pipeline();
    pipe.set(gKey, guild ? "1" : "0", "EX", RedisTTL.ignoreCache);
    pipe.set(cKey, channel ? "1" : "0", "EX", RedisTTL.ignoreCache);
    await pipe.exec();

    return { guild, channel };
  }

  public async isUserBlocklisted(
    userId: string,
    guildId?: string | null,
  ): Promise<boolean> {
    const block = await this.prisma.blocklist.findFirst({
      where: { userId, guildId: guildId ?? null },
    });
    return block !== null;
  }

  public async addBlocklistEntry(
    userId: string,
    blockedBy: string,
    reason?: string,
    guildId?: string | null,
  ): Promise<Blocklist> {
    if (guildId) await this.db.ensureGuild(guildId);
    const entry = await this.prisma.blocklist.create({
      data: { userId, blockedBy, reason, guildId },
    });
    await this.invalidate(RedisKeys.blocked(guildId ?? null, userId));
    return entry;
  }

  public async removeBlocklistEntry(
    userId: string,
    guildId?: string | null,
  ): Promise<void> {
    await this.prisma.blocklist.deleteMany({
      where: { userId, guildId: guildId ?? null },
    });
    await this.invalidate(RedisKeys.blocked(guildId ?? null, userId));
  }

  // `guildId` is required rather than optional because `null` is a meaningful
  // scope here — the global blocklist — not "any guild".
  public async listBlocklist(
    guildId: string | null,
    opts: { skip?: number; take?: number } = {},
  ): Promise<{ entries: Blocklist[]; total: number }> {
    const where = { guildId };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.blocklist.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: opts.skip ?? 0,
        take: opts.take ?? 25,
      }),
      this.prisma.blocklist.count({ where }),
    ]);

    return { entries, total };
  }

  // Includes the `channelId: null` guild-wide row.
  public listIgnoreEntries(guildId: string): Promise<IgnoreEntry[]> {
    return this.prisma.ignoreEntry.findMany({
      where: { guildId },
      orderBy: { createdAt: "asc" },
    });
  }

  public async isIgnored(guildId: string, channelId: string): Promise<boolean> {
    const ignore = await this.prisma.ignoreEntry.findFirst({
      where: { guildId, OR: [{ channelId }, { channelId: null }] },
    });
    return ignore !== null;
  }

  public async addIgnoreEntry(
    guildId: string,
    channelId?: string | null,
  ): Promise<IgnoreEntry> {
    const entry = await this.prisma.ignoreEntry.create({
      data: { guildId, channelId },
    });
    await this.invalidate(
      RedisKeys.channelIgnored(guildId, channelId ?? "global"),
    );
    await this.invalidate(RedisKeys.guildIgnored(guildId));
    return entry;
  }

  public async removeIgnoreEntry(
    guildId: string,
    channelId?: string | null,
  ): Promise<void> {
    await this.prisma.ignoreEntry.deleteMany({
      where: { guildId, channelId: channelId ?? null },
    });
    await this.invalidate(
      RedisKeys.channelIgnored(guildId, channelId ?? "global"),
    );
    await this.invalidate(RedisKeys.guildIgnored(guildId));
  }
}
