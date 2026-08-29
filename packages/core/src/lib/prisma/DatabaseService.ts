import type { RedisClient } from "#lib/database/cluster-safe.js";
import { scanKeysSafe } from "#lib/database/cluster-safe.js";
import { type ILogger, container } from "@sapphire/framework";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Stopwatch } from "@sapphire/stopwatch";
import { Prisma } from "@prisma/client";
import {
  createGuildTransaction,
  GuildWriteTransaction,
} from "#lib/guild-transaction.js";
import type { DatabaseClient } from "#lib/prisma/client.js";
import { ConfigRepository } from "#lib/prisma/repositories/ConfigRepository.js";
import { ModuleRepository } from "#lib/prisma/repositories/ModuleRepository.js";
import { GuildKVRepository } from "#lib/prisma/repositories/GuildKVRepository.js";
import { AccessRepository } from "#lib/prisma/repositories/AccessRepository.js";
import { PermissionRepository } from "#lib/prisma/repositories/PermissionRepository.js";
import { DownloaderRepository } from "#lib/prisma/repositories/DownloaderRepository.js";
import { AuditRepository } from "#lib/prisma/repositories/AuditRepository.js";
import { UserRepository } from "#lib/prisma/repositories/UserRepository.js";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";
import { ConfigHistoryRepository } from "#lib/prisma/repositories/ConfigHistoryRepository.js";
import { ConfigOverrideRepository } from "#lib/prisma/repositories/ConfigOverrideRepository.js";
import { AfkRepository } from "#lib/prisma/repositories/AfkRepository.js";
import { ModNoteRepository } from "#lib/prisma/repositories/ModNoteRepository.js";
import { AppealRepository } from "#lib/prisma/repositories/AppealRepository.js";
import { GlobalRepository } from "#lib/prisma/repositories/GlobalRepository.js";
import { SecurityRepository } from "#lib/prisma/repositories/SecurityRepository.js";
import { TempVcRepository } from "#lib/prisma/repositories/TempVcRepository.js";

export type {
  TargetPermitPayload,
  PolarityBucket,
  PermitKind,
  PermitTargetType,
  PermitPolarity,
  PermitRecord,
  PermitAssignmentRecord,
  PermitWithAssignments,
} from "#lib/prisma/repositories/PermissionRepository.js";
export type { AuditLogPayload } from "#lib/prisma/repositories/AuditRepository.js";
export type { ConfigHistoryEntry } from "#lib/prisma/repositories/ConfigHistoryRepository.js";
export type { ConfigOverrideEntry } from "#lib/prisma/repositories/ConfigOverrideRepository.js";

/**
 * Thin facade over the per-domain repositories.  Each repo owns its tables +
 * Redis keys/TTLs and shares the cache-aside `getOrSet` / `InvalidationBus`
 * primitives from the `Repository` base class.  `container.db.<repo>.<method>`
 * is the only sanctioned data-access path for features - never touch
 * `container.prisma` from a module.
 *
 * A handful of cross-domain operations (`deleteUserData`, `transaction`,
 * `publishBotStats`) live on the facade itself because they span repositories.
 */
export class DatabaseService {
  public readonly global: GlobalRepository;
  public readonly config: ConfigRepository;
  public readonly modules: ModuleRepository;
  public readonly guildKV: GuildKVRepository;
  public readonly access: AccessRepository;
  public readonly permissions: PermissionRepository;
  public readonly downloader: DownloaderRepository;
  public readonly audit: AuditRepository;
  public readonly users: UserRepository;
  public readonly moderation: ModerationRepository;
  public readonly configHistory: ConfigHistoryRepository;
  public readonly configOverrides: ConfigOverrideRepository;
  public readonly afk: AfkRepository;
  public readonly modNotes: ModNoteRepository;
  public readonly appeals: AppealRepository;
  public readonly security: SecurityRepository;
  public readonly tempvc: TempVcRepository;

  public constructor(
    private readonly prisma: DatabaseClient,
    private readonly redis: RedisClient,
    logger: ILogger,
    /** Optional read replica; only the fleet-wide sweeps are routed to it. */
    reader: DatabaseClient = prisma,
  ) {
    this.global = new GlobalRepository(prisma, redis, logger, this);
    this.config = new ConfigRepository(prisma, redis, logger, this);
    this.modules = new ModuleRepository(prisma, redis, logger, this);
    this.guildKV = new GuildKVRepository(prisma, redis, logger, this);
    this.access = new AccessRepository(prisma, redis, logger, this);
    this.permissions = new PermissionRepository(prisma, redis, logger, this);
    this.downloader = new DownloaderRepository(prisma, redis, logger, this);
    this.audit = new AuditRepository(prisma, redis, logger, this);
    this.users = new UserRepository(prisma, redis, logger, this);
    this.moderation = new ModerationRepository(prisma, redis, logger, this, reader);
    this.configHistory = new ConfigHistoryRepository(
      prisma,
      redis,
      logger,
      this,
    );
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
  }

  /** Ensures a Guild row exists so dependent rows can satisfy their FK. */
  public async ensureGuild(guildId: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });
  }

  public async publishBotStats(stats: Record<string, unknown>): Promise<void> {
    await this.redis.setex(
      RedisKeys.botStats(),
      RedisTTL.botStats,
      JSON.stringify(stats),
    );
  }

  /**
   * Core user-data deletion - called by executeGdprDeletion() after all module
   * hooks have run.  Spans several repositories' tables, so it lives on the
   * facade:
   *
   *  - User        : delete the profile row
   *  - Blocklist   : delete entries where this user is the subject
   *  - AuditLedger : delete all action records for the user
   *
   * IgnoreEntry has no userId column.  AfkEntry is handled by the AFK module
   * hook.  ModerationCase anonymization is handled by the mod module hook
   * (ModerationRepository.anonymizeUser) - do not duplicate it here.
   * Blocklist Redis keys are scanned and invalidated, then the entity-cache
   * user projection is purged last.
   */
  public async deleteUserData(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.blocklist.deleteMany({ where: { userId } }),
      this.prisma.auditLedger.deleteMany({ where: { userId } }),
      this.prisma.user.deleteMany({ where: { id: userId } }),
    ]);

    const keys = await scanKeysSafe(
      this.redis,
      RedisKeys.blockedPattern(userId),
    );

    if (keys.length) {
      await container.invalidation.invalidate(...keys);
    }

    // The entity cache holds a username projection under its own TTL, so
    // without this an erased user stays readable there for up to a day.
    await container.entityCache.deleteUser(userId);
  }

  public async exportUserData(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const [user, blocklist, auditLedger] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.blocklist.findMany({ where: { userId } }),
      this.prisma.auditLedger.findMany({ where: { userId } }),
    ]);

    if (!user && blocklist.length === 0 && auditLedger.length === 0) {
      return null;
    }

    return { user, blocklist, auditLedger };
  }

  public transaction(guildId: string): Promise<GuildWriteTransaction> {
    return createGuildTransaction(guildId, this.redis, this.prisma);
  }

  public async probePrisma(): Promise<number> {
    const sw = new Stopwatch();
    await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
    return sw.stop().duration;
  }

  public async getPostgresStats(): Promise<{
    overview?: { size: string; uptime_secs: string };
    tables: { relname: string; bytes: string; dead: string }[];
    tx?: { commits: string; rollbacks: string };
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
