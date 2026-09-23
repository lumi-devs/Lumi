import type { Blocklist, GlobalBlock, IgnoreEntry } from "@prisma/client";
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
    const [gBlocked, sBlocked] = await Promise.all([
      this.getOrSet(RedisKeys.blocked(null, userId), RedisTTL.blockedCache, () =>
        this.prisma.globalBlock
          .findUnique({ where: { userId } })
          .then((r) => r !== null),
      ),
      guildId
        ? this.getOrSet(
            RedisKeys.blocked(guildId, userId),
            RedisTTL.blockedCache,
            () =>
              this.prisma.blocklist
                .findFirst({ where: { userId, guildId } })
                .then((r) => r !== null),
          )
        : Promise.resolve(false),
    ]);

    return gBlocked || sBlocked;
  }

  /** Whole-guild ignore flag (`Guild.ignored`), cached on its own key. */
  public isGuildIgnored(guildId: string): Promise<boolean> {
    return this.getOrSet(
      RedisKeys.guildIgnored(guildId),
      RedisTTL.ignoreCache,
      () =>
        this.prisma.guild
          .findUnique({ where: { id: guildId }, select: { ignored: true } })
          .then((r) => r?.ignored ?? false),
    );
  }

  public async getIgnoreStatus(guildId: string, channelId: string) {
    const [guild, channel] = await Promise.all([
      this.isGuildIgnored(guildId),
      this.getOrSet(
        RedisKeys.channelIgnored(guildId, channelId),
        RedisTTL.ignoreCache,
        () =>
          this.prisma.ignoreEntry
            .findUnique({
              where: { uq_ignore_guild_channel: { guildId, channelId } },
            })
            .then((r) => r !== null),
      ),
    ]);

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
    await this.db.ensureGuild(guildId);
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
