import type { Allowlist, Blocklist, GlobalAllow, GlobalBlock, IgnoreEntry } from "@prisma/client";
import { ValkeyKeys, ValkeyTTL } from "#src/lib/valkey/Client.js";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";

export class AccessRepository extends Repository {
  public async isUserBlocked(
    userId: string,
    guildId: string | null,
  ): Promise<boolean> {
    const [gBlocked, sBlocked] = await Promise.all([
      this.getOrSet(ValkeyKeys.blocked(null, userId), ValkeyTTL.blockedCache, () =>
        this.prisma.globalBlock
          .findUnique({ where: { userId } })
          .then((r) => r !== null),
      ),
      guildId
        ? this.getOrSet(
            ValkeyKeys.blocked(guildId, userId),
            ValkeyTTL.blockedCache,
            () =>
              this.prisma.blocklist
                .findFirst({ where: { userId, guildId } })
                .then((r) => r !== null),
          )
        : Promise.resolve(false),
    ]);

    return gBlocked || sBlocked;
  }

  public isGuildIgnored(guildId: string): Promise<boolean> {
    return this.getOrSet(
      ValkeyKeys.guildIgnored(guildId),
      ValkeyTTL.ignoreCache,
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
        ValkeyKeys.channelIgnored(guildId, channelId),
        ValkeyTTL.ignoreCache,
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
      const entry = await this.prisma.globalBlock.upsert({
        where: { userId },
        create: {
          userId,
          blockedBy,
          ...(reason === undefined ? {} : { reason }),
        },
        update: {
          blockedBy,
          ...(reason === undefined ? {} : { reason }),
        },
      });
      await this.invalidate(ValkeyKeys.blocked(null, userId));
      return entry;
    }
    await this.db.ensureGuild(guildId);
    const entry = await this.prisma.blocklist.upsert({
      where: { uq_blocklist_user_guild: { userId, guildId } },
      create: {
        userId,
        blockedBy,
        ...(reason === undefined ? {} : { reason }),
        guildId,
      },
      update: {
        blockedBy,
        ...(reason === undefined ? {} : { reason }),
      },
    });
    await this.invalidate(ValkeyKeys.blocked(guildId, userId));
    return entry;
  }

  public async removeBlocklistEntry(
    userId: string,
    guildId?: string | null,
  ): Promise<void> {
    if (!guildId) {
      await this.prisma.globalBlock.deleteMany({ where: { userId } });
      await this.invalidate(ValkeyKeys.blocked(null, userId));
      return;
    }
    await this.prisma.blocklist.deleteMany({ where: { userId, guildId } });
    await this.invalidate(ValkeyKeys.blocked(guildId, userId));
  }

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

  public async isUserAllowed(
    userId: string,
    guildId: string | null,
  ): Promise<boolean> {
    const [gAllowed, sAllowed] = await Promise.all([
      this.getOrSet(ValkeyKeys.accessAllow(null, userId), ValkeyTTL.allowCache, () =>
        this.prisma.globalAllow
          .findUnique({ where: { userId } })
          .then((r) => r !== null),
      ),
      guildId
        ? this.getOrSet(
            ValkeyKeys.accessAllow(guildId, userId),
            ValkeyTTL.allowCache,
            () =>
              this.prisma.allowlist
                .findFirst({ where: { userId, guildId } })
                .then((r) => r !== null),
          )
        : Promise.resolve(false),
    ]);

    return gAllowed || sAllowed;
  }

  public async hasAllowEntries(guildId: string | null): Promise<boolean> {
    if (!guildId) {
      return (await this.prisma.globalAllow.count()) > 0;
    }
    const [global, scoped] = await Promise.all([
      this.prisma.globalAllow.count(),
      this.prisma.allowlist.count({ where: { guildId } }),
    ]);
    return global + scoped > 0;
  }

  public async allowedByLists(
    userId: string,
    guildId: string | null,
  ): Promise<boolean> {
    if (await this.isUserBlocked(userId, guildId)) return false;
    if (!(await this.hasAllowEntries(guildId))) return true;
    return this.isUserAllowed(userId, guildId);
  }

  public async addAllowEntry(
    userId: string,
    allowedBy: string,
    reason?: string,
    guildId?: string | null,
  ): Promise<Allowlist | GlobalAllow> {
    if (!guildId) {
      const entry = await this.prisma.globalAllow.upsert({
        where: { userId },
        create: {
          userId,
          allowedBy,
          ...(reason === undefined ? {} : { reason }),
        },
        update: {
          allowedBy,
          ...(reason === undefined ? {} : { reason }),
        },
      });
      await this.invalidate(ValkeyKeys.accessAllow(null, userId));
      return entry;
    }
    await this.db.ensureGuild(guildId);
    const entry = await this.prisma.allowlist.upsert({
      where: { uq_allowlist_user_guild: { userId, guildId } },
      create: {
        userId,
        allowedBy,
        ...(reason === undefined ? {} : { reason }),
        guildId,
      },
      update: {
        allowedBy,
        ...(reason === undefined ? {} : { reason }),
      },
    });
    await this.invalidate(ValkeyKeys.accessAllow(guildId, userId));
    return entry;
  }

  public async removeAllowEntry(
    userId: string,
    guildId?: string | null,
  ): Promise<void> {
    if (!guildId) {
      await this.prisma.globalAllow.deleteMany({ where: { userId } });
      await this.invalidate(ValkeyKeys.accessAllow(null, userId));
      return;
    }
    await this.prisma.allowlist.deleteMany({ where: { userId, guildId } });
    await this.invalidate(ValkeyKeys.accessAllow(guildId, userId));
  }

  public listAllowlist(
    guildId: string | null,
    opts: { skip?: number; take?: number } = {},
  ): Promise<{ entries: (Allowlist | GlobalAllow)[]; total: number }> {
    if (!guildId) {
      return this.prisma.$transaction([
        this.prisma.globalAllow.findMany({
          orderBy: { createdAt: "desc" },
          skip: opts.skip ?? 0,
          take: opts.take ?? 25,
        }),
        this.prisma.globalAllow.count(),
      ]).then(([entries, total]) => ({ entries, total }));
    }

    const where = { guildId };
    return this.prisma.$transaction([
      this.prisma.allowlist.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: opts.skip ?? 0,
        take: opts.take ?? 25,
      }),
      this.prisma.allowlist.count({ where }),
    ]).then(([entries, total]) => ({ entries, total }));
  }

  public listIgnoreEntries(guildId: string): Promise<IgnoreEntry[]> {
    return this.prisma.ignoreEntry.findMany({
      where: { guildId },
      orderBy: { createdAt: "asc" },
    });
  }

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
      await this.invalidate(ValkeyKeys.guildIgnored(guildId));
      return null;
    }
    await this.db.ensureGuild(guildId);
    const entry = await this.prisma.ignoreEntry.create({
      data: { guildId, channelId },
    });
    await this.invalidate(ValkeyKeys.channelIgnored(guildId, channelId));
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
      await this.invalidate(ValkeyKeys.guildIgnored(guildId));
      return;
    }
    await this.prisma.ignoreEntry.deleteMany({
      where: { guildId, channelId },
    });
    await this.invalidate(ValkeyKeys.channelIgnored(guildId, channelId));
  }
}
