import type { Redis } from "ioredis";
import { type ILogger, container } from "@sapphire/framework";
import { RedisKeys, RedisTTL } from "#database/redis.js";
import {
  createGuildTransaction,
  GuildWriteTransaction,
} from "#lib/guild-transaction.js";
import type { DatabaseClient } from "#database/client.js";
import { ConfigRepository } from "#root/prisma/repositories/ConfigRepository.js";
import { ModuleRepository } from "#root/prisma/repositories/ModuleRepository.js";
import { GuildKVRepository } from "#root/prisma/repositories/GuildKVRepository.js";
import { AccessRepository } from "#root/prisma/repositories/AccessRepository.js";
import { PermissionRepository } from "#root/prisma/repositories/PermissionRepository.js";
import { DownloaderRepository } from "#root/prisma/repositories/DownloaderRepository.js";
import { AuditRepository } from "#root/prisma/repositories/AuditRepository.js";
import { UserRepository } from "#root/prisma/repositories/UserRepository.js";
import { ModerationRepository } from "#root/prisma/repositories/ModerationRepository.js";
import { ConfigHistoryRepository } from "#root/prisma/repositories/ConfigHistoryRepository.js";
import { ConfigOverrideRepository } from "#root/prisma/repositories/ConfigOverrideRepository.js";
import { AfkRepository } from "#root/prisma/repositories/AfkRepository.js";
import { ThreadRepository } from "#root/prisma/repositories/ThreadRepository.js";

// Re-export the row/payload shapes so existing importers keep working.
export type { CachedOverride } from "#root/prisma/repositories/PermissionRepository.js";
export type { AuditLogPayload } from "#root/prisma/repositories/AuditRepository.js";
export type { ConfigHistoryEntry } from "#root/prisma/repositories/ConfigHistoryRepository.js";
export type { ConfigOverrideEntry } from "#root/prisma/repositories/ConfigOverrideRepository.js";

/**
 * Thin facade over the per-domain repositories.  Each repo owns its tables +
 * Redis keys/TTLs and shares the cache-aside `getOrSet` / `InvalidationBus`
 * primitives from the `Repository` base class.  `container.db.<repo>.<method>`
 * is the only sanctioned data-access path for features — never touch
 * `container.prisma` from a module.
 *
 * A handful of cross-domain operations (`deleteUserData`, `transaction`,
 * `publishBotStats`) live on the facade itself because they span repositories.
 */
export class DatabaseService {
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
  public readonly threads: ThreadRepository;

  public constructor(
    private readonly prisma: DatabaseClient,
    private readonly redis: Redis,
    logger: ILogger,
  ) {
    this.config = new ConfigRepository(prisma, redis, logger, this);
    this.modules = new ModuleRepository(prisma, redis, logger, this);
    this.guildKV = new GuildKVRepository(prisma, redis, logger, this);
    this.access = new AccessRepository(prisma, redis, logger, this);
    this.permissions = new PermissionRepository(prisma, redis, logger, this);
    this.downloader = new DownloaderRepository(prisma, redis, logger, this);
    this.audit = new AuditRepository(prisma, redis, logger, this);
    this.users = new UserRepository(prisma, redis, logger, this);
    this.moderation = new ModerationRepository(prisma, redis, logger, this);
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
    this.afk = new AfkRepository(prisma, redis, logger, this);
    this.threads = new ThreadRepository(prisma, redis, logger, this);
  }

  public async publishBotStats(stats: Record<string, unknown>): Promise<void> {
    await this.redis.setex(
      RedisKeys.botStats(),
      RedisTTL.botStats,
      JSON.stringify(stats),
    );
  }

  /**
   * Core user-data deletion — called by executeGdprDeletion() after all module
   * hooks have run.  Spans several repositories' tables, so it lives on the
   * facade:
   *
   *  - User        : delete the profile row
   *  - Blocklist   : delete entries where this user is the subject
   *  - AuditLedger : delete all action records for the user
   *
   * IgnoreEntry has no userId column.  AfkEntry is handled by the AFK module
   * hook.  ModerationCase anonymization is handled by the mod module hook
   * (ModerationRepository.anonymizeUser) — do not duplicate it here.
   * Blocklist Redis keys are scanned and invalidated last.
   */
  public async deleteUserData(userId: string): Promise<void> {
    // One atomic transaction: a mid-sequence failure must not leave the user's
    // PII half-deleted (e.g. profile gone but audit rows orphaned). The array
    // form runs all three writes in a single DB transaction.
    await this.prisma.$transaction([
      this.prisma.blocklist.deleteMany({ where: { userId } }),
      this.prisma.auditLedger.deleteMany({ where: { userId } }),
      this.prisma.user.deleteMany({ where: { id: userId } }),
    ]);

    // Cache invalidation runs only after the DB commit succeeds — no point
    // dropping cached entries for writes that may have rolled back.
    let cursor = "0";
    const keys: string[] = [];
    do {
      const [next, found] = await this.redis.scan(
        cursor,
        "MATCH",
        RedisKeys.blockedPattern(userId),
        "COUNT",
        100,
      );
      cursor = next;
      keys.push(...found);
    } while (cursor !== "0");

    if (keys.length) {
      await container.invalidation.invalidate(...keys);
    }
  }

  public transaction(guildId: string): Promise<GuildWriteTransaction> {
    return createGuildTransaction(guildId, this.redis, this.prisma);
  }
}
