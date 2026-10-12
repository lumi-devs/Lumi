import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import {scanKeysSafe} from "#src/lib/valkey/Cluster.js";
import { type ILogger } from "#src/shared/Index.ts";
import { container } from "#src/lib/Services.js";
import { ValkeyKeys, ValkeyTTL } from "#src/lib/valkey/Store.js";
import { Prisma } from "@prisma/client";
import {
  createGuildTransaction,
  GuildWriteTransaction,
} from "#src/lib/prisma/GuildTransaction.js";
import type { DatabaseClient } from "#src/lib/prisma/Client.js";
import { ConfigRepository } from "#src/lib/prisma/repositories/ConfigRepository.js";
import { ModuleRepository } from "#src/lib/prisma/repositories/ModuleRepository.js";
import { GuildKVRepository } from "#src/lib/prisma/repositories/GuildKvRepository.js";
import { AccessRepository } from "#src/lib/prisma/repositories/AccessRepository.js";
import { PermissionRepository } from "#src/lib/prisma/repositories/PermissionRepository.js";
import { DownloaderRepository } from "#src/modules/core/data/DownloaderRepository.js";
import { AuditRepository } from "#src/lib/prisma/repositories/AuditRepository.js";
import { ModerationRepository } from "#src/lib/prisma/repositories/ModerationRepository.js";
import { ConfigHistoryRepository } from "#src/lib/prisma/repositories/ConfigHistoryRepository.js";
import { ConfigOverrideRepository } from "#src/lib/prisma/repositories/ConfigOverrideRepository.js";
import { AfkRepository } from "#src/modules/afk/data/AfkRepository.js";
import { ModNoteRepository } from "#src/modules/mod/data/ModNoteRepository.js";
import { AppealRepository } from "#src/modules/mod/data/AppealRepository.js";
import { GlobalRepository } from "#src/lib/prisma/repositories/GlobalRepository.js";
import { SecurityRepository } from "#src/modules/security/data/SecurityRepository.js";
import { TempVcRepository } from "#src/modules/tempvc/data/TempVcRepository.js";
import { EconomyRepository } from "#src/modules/economy/data/EconomyRepository.js";
import { LevelRepository } from "#src/modules/leveling/data/LevelRepository.js";
import { ReactionRoleRepository } from "#src/modules/reactionroles/data/ReactionRoleRepository.js";
import { GdprExportJobRepository } from "#src/lib/prisma/repositories/GdprExportJobRepository.js";
import { FeatureFlagRepository } from "#src/lib/prisma/repositories/FeatureFlagRepository.js";
import { SharedTokenRepository } from "#src/lib/prisma/repositories/SharedTokenRepository.js";

export type { ConfigHistoryEntry } from "#src/lib/prisma/repositories/ConfigHistoryRepository.js";
export type { ConfigOverrideEntry } from "#src/lib/prisma/repositories/ConfigOverrideRepository.js";

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
    private readonly valkey: ValkeyClient,
    logger: ILogger,

    reader: DatabaseClient = prisma,
  ) {
    this.global = new GlobalRepository(prisma, valkey, logger, this);
    this.configHistory = new ConfigHistoryRepository(
      prisma,
      valkey,
      logger,
      this,
    );
    this.config = new ConfigRepository(
      prisma,
      valkey,
      logger,
      this,
      this.configHistory,
    );
    this.modules = new ModuleRepository(
      prisma,
      valkey,
      logger,
      this,
      this.config,
    );
    this.guildKV = new GuildKVRepository(prisma, valkey, logger, this);
    this.access = new AccessRepository(prisma, valkey, logger, this);
    this.permissions = new PermissionRepository(prisma, valkey, logger, this);
    this.downloader = new DownloaderRepository(prisma, valkey, logger, this);
    this.audit = new AuditRepository(prisma, valkey, logger, this);
    this.moderation = new ModerationRepository(prisma, valkey, logger, this, reader);
    this.configOverrides = new ConfigOverrideRepository(
      prisma,
      valkey,
      logger,
      this,
    );
    this.afk = new AfkRepository(prisma, valkey, logger, this, reader);
    this.modNotes = new ModNoteRepository(prisma, valkey, logger, this);
    this.appeals = new AppealRepository(prisma, valkey, logger, this);
    this.security = new SecurityRepository(prisma, valkey, logger, this);
    this.tempvc = new TempVcRepository(prisma, valkey, logger, this);
    this.economy = new EconomyRepository(prisma, valkey, logger, this);
    this.leveling = new LevelRepository(prisma, valkey, logger, this);
    this.reactionRoles = new ReactionRoleRepository(prisma, valkey, logger, this);
    this.gdprExportJobs = new GdprExportJobRepository(prisma, valkey, logger, this);
    this.featureFlags = new FeatureFlagRepository(prisma, valkey, logger, this);
    this.sharedTokens = new SharedTokenRepository(prisma, valkey, logger, this);
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
    await this.valkey.setex(
      ValkeyKeys.botStats(),
      ValkeyTTL.botStats,
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
      this.valkey,
      ValkeyKeys.blockedPattern(userId),
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
    return createGuildTransaction(guildId, this.valkey, this.prisma);
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
