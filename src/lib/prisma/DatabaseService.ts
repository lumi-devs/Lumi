import type {RedisClient} from "@redis/Cluster.js";
import {scanKeysSafe} from "@redis/Cluster.js";
import { type ILogger } from "@shared/Index.ts";
import { container } from "@lib/Services.js";
import { RedisKeys, RedisTTL } from "@redis/Store.js";
import { Prisma } from "@prisma/client";
import {
  createGuildTransaction,
  GuildWriteTransaction,
} from "@db/GuildTransaction.js";
import type { DatabaseClient } from "@db/Client.js";
import { ConfigRepository } from "@db/repositories/ConfigRepository.js";
import { ModuleRepository } from "@db/repositories/ModuleRepository.js";
import { GuildKVRepository } from "@db/repositories/GuildKvRepository.js";
import { AccessRepository } from "@db/repositories/AccessRepository.js";
import { PermissionRepository } from "@db/repositories/PermissionRepository.js";
import { DownloaderRepository } from "@modules/admin/data/DownloaderRepository.js";
import { AuditRepository } from "@db/repositories/AuditRepository.js";
import { ModerationRepository } from "@db/repositories/ModerationRepository.js";
import { ConfigHistoryRepository } from "@db/repositories/ConfigHistoryRepository.js";
import { ConfigOverrideRepository } from "@db/repositories/ConfigOverrideRepository.js";
import { AfkRepository } from "@modules/afk/data/AfkRepository.js";
import { ModNoteRepository } from "@modules/mod/data/ModNoteRepository.js";
import { AppealRepository } from "@modules/mod/data/AppealRepository.js";
import { GlobalRepository } from "@db/repositories/GlobalRepository.js";
import { SecurityRepository } from "@modules/security/data/SecurityRepository.js";
import { TempVcRepository } from "@modules/tempvc/data/TempVcRepository.js";
import { EconomyRepository } from "@modules/economy/data/EconomyRepository.js";
import { LevelRepository } from "@modules/leveling/data/LevelRepository.js";
import { ReactionRoleRepository } from "@modules/reactionroles/data/ReactionRoleRepository.js";
import { GdprExportJobRepository } from "@db/repositories/GdprExportJobRepository.js";
import { FeatureFlagRepository } from "@db/repositories/FeatureFlagRepository.js";
import { SharedTokenRepository } from "@db/repositories/SharedTokenRepository.js";

export type { ConfigHistoryEntry } from "@db/repositories/ConfigHistoryRepository.js";
export type { ConfigOverrideEntry } from "@db/repositories/ConfigOverrideRepository.js";

export class DatabaseService {
  public readonly global: GlobalRepository;
  public readonly config: ConfigRepository;
  public readonly modules: ModuleRepository;
  public readonly guildKV: GuildKVRepository;
  public readonly access: AccessRepository;
  public readonly permissions: PermissionRepository;
  public readonly downloader: DownloaderRepository;
  public readonly audit: AuditRepository;
  public readonly moderation: ModerationRepository;
  public readonly configHistory: ConfigHistoryRepository;
  public readonly configOverrides: ConfigOverrideRepository;
  public readonly afk: AfkRepository;
  public readonly modNotes: ModNoteRepository;
  public readonly appeals: AppealRepository;
  public readonly security: SecurityRepository;
  public readonly tempvc: TempVcRepository;
  public readonly economy: EconomyRepository;
  public readonly leveling: LevelRepository;
  public readonly reactionRoles: ReactionRoleRepository;
  public readonly gdprExportJobs: GdprExportJobRepository;
  public readonly featureFlags: FeatureFlagRepository;
  public readonly sharedTokens: SharedTokenRepository;

  public constructor(
    private readonly prisma: DatabaseClient,
    private readonly redis: RedisClient,
    logger: ILogger,

    reader: DatabaseClient = prisma,
  ) {
    this.global = new GlobalRepository(prisma, redis, logger, this);
    this.configHistory = new ConfigHistoryRepository(
      prisma,
      redis,
      logger,
      this,
    );
    this.config = new ConfigRepository(
      prisma,
      redis,
      logger,
      this,
      this.configHistory,
    );
    this.modules = new ModuleRepository(
      prisma,
      redis,
      logger,
      this,
      this.config,
    );
    this.guildKV = new GuildKVRepository(prisma, redis, logger, this);
    this.access = new AccessRepository(prisma, redis, logger, this);
    this.permissions = new PermissionRepository(prisma, redis, logger, this);
    this.downloader = new DownloaderRepository(prisma, redis, logger, this);
    this.audit = new AuditRepository(prisma, redis, logger, this);
    this.moderation = new ModerationRepository(prisma, redis, logger, this, reader);
    this.configOverrides = new ConfigOverrideRepository(
      prisma,
      redis,
      logger,
      this,
    );
    this.afk = new AfkRepository(prisma, redis, logger, this, reader);
    this.modNotes = new ModNoteRepository(prisma, redis, logger, this);
    this.appeals = new AppealRepository(prisma, redis, logger, this);
    this.security = new SecurityRepository(prisma, redis, logger, this);
    this.tempvc = new TempVcRepository(prisma, redis, logger, this);
    this.economy = new EconomyRepository(prisma, redis, logger, this);
    this.leveling = new LevelRepository(prisma, redis, logger, this);
    this.reactionRoles = new ReactionRoleRepository(prisma, redis, logger, this);
    this.gdprExportJobs = new GdprExportJobRepository(prisma, redis, logger, this);
    this.featureFlags = new FeatureFlagRepository(prisma, redis, logger, this);
    this.sharedTokens = new SharedTokenRepository(prisma, redis, logger, this);
  }

  public async ensureGuild(guildId: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });
  }

  public async markGuildLeft(guildId: string): Promise<void> {
    await this.prisma.guild
      .update({
        where: { id: guildId },
        data: { leftAt: new Date() },
      })
      // The row may not exist if the bot left before ever writing one -
      // nothing to mark departed in that case.
      .catch(() => {});
  }

  public async markGuildRejoined(guildId: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: { leftAt: null },
    });
  }

  public async findDepartedGuildIds(guildIds: string[]): Promise<string[]> {
    if (guildIds.length === 0) return [];
    const rows = await this.prisma.guild.findMany({
      where: { id: { in: guildIds }, leftAt: { not: null } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  public async findActiveGuildIds(): Promise<string[]> {
    const rows = await this.prisma.guild.findMany({
      where: { leftAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  public async purgeDepartedGuilds(cutoffDate: Date): Promise<string[]> {
    const departed = await this.prisma.guild.findMany({
      where: { leftAt: { lt: cutoffDate } },
      select: { id: true },
    });
    if (departed.length === 0) return [];

    await this.prisma.guild.deleteMany({
      where: { leftAt: { lt: cutoffDate } },
    });

    return departed.map((row) => row.id);
  }

  public async publishBotStats(stats: Record<string, unknown>): Promise<void> {
    await this.redis.setex(
      RedisKeys.botStats(),
      RedisTTL.botStats,
      JSON.stringify(stats),
    );
  }

  public async deleteUserData(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.permitAssignment.deleteMany({
        where: { targetType: "user", targetId: userId },
      }),
      this.prisma.blocklist.deleteMany({ where: { userId } }),
      this.prisma.globalBlock.deleteMany({ where: { userId } }),
      this.prisma.auditLedger.deleteMany({ where: { userId } }),
    ]);

    const keys = await scanKeysSafe(
      this.redis,
      RedisKeys.blockedPattern(userId),
    );

    if (keys.length) {
      await container.invalidation.invalidate(...keys);
    }
  }

  public async exportUserData(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const [blocklist, globalBlock, auditLedger] = await Promise.all([
      this.prisma.blocklist.findMany({ where: { userId } }),
      this.prisma.globalBlock.findUnique({ where: { userId } }),
      this.prisma.auditLedger.findMany({ where: { userId } }),
    ]);

    if (!globalBlock && blocklist.length === 0 && auditLedger.length === 0) {
      return null;
    }

    return { blocklist, globalBlock, auditLedger };
  }

  public transaction(guildId: string): Promise<GuildWriteTransaction> {
    return createGuildTransaction(guildId, this.redis, this.prisma);
  }

  public async probePrisma(): Promise<number> {
    const start = performance.now();
    await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
    return performance.now() - start;
  }

  public async getPostgresStats(): Promise<{
    overview?: { size: string; uptime_secs: string } | undefined;
    tables: { relname: string; bytes: string; dead: string }[];
    tx?: { commits: string; rollbacks: string } | undefined;
  }> {
    const [[ov], tables, [tx]] = await Promise.all([
      this.prisma.$queryRaw<{ size: string; uptime_secs: string }[]>(
        Prisma.sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size, extract(epoch from (now() - pg_postmaster_start_time()))::int::text AS uptime_secs`,
      ),
      this.prisma.$queryRaw<
        { relname: string; bytes: string; dead: string }[]
      >(
        Prisma.sql`SELECT relname, pg_total_relation_size(relid)::text AS bytes, n_dead_tup::text AS dead FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 6`,
      ),
      this.prisma.$queryRaw<{ commits: string; rollbacks: string }[]>(
        Prisma.sql`SELECT xact_commit::text AS commits, xact_rollback::text AS rollbacks FROM pg_stat_database WHERE datname = current_database()`,
      ),
    ]);

    return {
      overview: ov,
      tables: tables ?? [],
      tx,
    };
  }
}
