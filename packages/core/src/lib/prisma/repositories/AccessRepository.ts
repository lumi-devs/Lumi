import type { Blocklist, GlobalBlock, IgnoreEntry } from "@prisma/client";
import { pipelineBySlot } from "#lib/database/cluster-safe.js";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/**
 * Access control: the global (`GlobalBlock`) and per-guild (`Blocklist`)
 * block tables, plus `IgnoreEntry` (per-channel) and `Guild.ignored`
 * (whole-guild), with their bespoke `"1"/"0"` Redis caches.
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

    const [globalBlock, guildBlock] = await Promise.all([
      this.prisma.globalBlock.findUnique({ where: { userId } }),
      guildId
        ? this.prisma.blocklist.findFirst({ where: { userId, guildId } })
        : Promise.resolve(null),
    ]);

    const gBlocked = globalBlock !== null;
    const sBlocked = guildBlock !== null;

    await pipelineBySlot(
      this.redis,
      [
        { key: gKey, value: gBlocked },
        ...(sKey ? [{ key: sKey, value: sBlocked }] : []),
      ],
      (entry) => entry.key,
      (pipe, entry) => {
        pipe.setex(entry.key, RedisTTL.blockedCache, entry.value ? "1" : "0");
      },
    );

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

    const [guildRow, channelRow] = await Promise.all([
      this.prisma.guild.findUnique({
        where: { id: guildId },
        select: { ignored: true },
      }),
      this.prisma.ignoreEntry.findUnique({
        where: { uq_ignore_guild_channel: { guildId, channelId } },
      }),
    ]);

    const guild = guildRow?.ignored ?? false;
    const channel = channelRow !== null;

    await pipelineBySlot(
      this.redis,
      [
        { key: gKey, value: guild },
        { key: cKey, value: channel },
      ],
      (entry) => entry.key,
      (pipe, entry) => {
        pipe.set(entry.key, entry.value ? "1" : "0", "EX", RedisTTL.ignoreCache);
      },
    );

    return { guild, channel };
  }

  public async isUserBlocklisted(
    userId: string,
    guildId?: string | null,
  ): Promise<boolean> {
    if (!guildId) {
      const block = await this.prisma.globalBlock.findUnique({
        where: { userId },
      });
      return block !== null;
    }
    const block = await this.prisma.blocklist.findFirst({
      where: { userId, guildId },
    });
    return block !== null;
  }

  public async addBlocklistEntry(
    userId: string,
    blockedBy: string,
    reason?: string,
    guildId?: string | null,
  ): Promise<Blocklist | GlobalBlock> {
    if (!guildId) {
      const entry = await this.prisma.globalBlock.create({
        data: { userId, blockedBy, reason },
      });
      await this.invalidate(RedisKeys.blocked(null, userId));
      return entry;
    }
    await this.db.ensureGuild(guildId);
    const entry = await this.prisma.blocklist.create({
      data: { userId, blockedBy, reason, guildId },
    });
    await this.invalidate(RedisKeys.blocked(guildId, userId));
    return entry;
  }

  public async removeBlocklistEntry(
    userId: string,
    guildId?: string | null,
  ): Promise<void> {
    if (!guildId) {
      await this.prisma.globalBlock.deleteMany({ where: { userId } });
      await this.invalidate(RedisKeys.blocked(null, userId));
      return;
    }
    await this.prisma.blocklist.deleteMany({ where: { userId, guildId } });
    await this.invalidate(RedisKeys.blocked(guildId, userId));
  }

  // `guildId` is required rather than optional because `null` is a meaningful
  // scope here — the global blocklist — not "any guild".
  public async listBlocklist(
    guildId: string | null,
    opts: { skip?: number; take?: number } = {},
  ): Promise<{ entries: (Blocklist | GlobalBlock)[]; total: number }> {
    if (!guildId) {
      const [entries, total] = await this.prisma.$transaction([
        this.prisma.globalBlock.findMany({
          orderBy: { createdAt: "desc" },
          skip: opts.skip ?? 0,
          take: opts.take ?? 25,
        }),
        this.prisma.globalBlock.count(),
      ]);
      return { entries, total };
    }

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

  public listIgnoreEntries(guildId: string): Promise<IgnoreEntry[]> {
    return this.prisma.ignoreEntry.findMany({
      where: { guildId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * `channelId: null` sets/clears the whole-guild ignore flag (`Guild.ignored`)
   * instead of an `IgnoreEntry` row, which now requires a real channel id.
   */
  public async addIgnoreEntry(
    guildId: string,
    channelId?: string | null,
  ): Promise<IgnoreEntry | null> {
    if (!channelId) {
      await this.prisma.guild.upsert({
        where: { id: guildId },
        create: { id: guildId, ignored: true },
        update: { ignored: true },
      });
      await this.invalidate(RedisKeys.guildIgnored(guildId));
      return null;
    }
    const entry = await this.prisma.ignoreEntry.create({
      data: { guildId, channelId },
    });
    await this.invalidate(RedisKeys.channelIgnored(guildId, channelId));
    return entry;
  }

  public async removeIgnoreEntry(
    guildId: string,
    channelId?: string | null,
  ): Promise<void> {
    if (!channelId) {
      await this.prisma.guild.upsert({
        where: { id: guildId },
        create: { id: guildId, ignored: false },
        update: { ignored: false },
      });
      await this.invalidate(RedisKeys.guildIgnored(guildId));
      return;
    }
    await this.prisma.ignoreEntry.deleteMany({
      where: { guildId, channelId },
    });
    await this.invalidate(RedisKeys.channelIgnored(guildId, channelId));
  }
}
