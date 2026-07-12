import type { Redis } from "ioredis";
import { type ILogger, container } from "@sapphire/framework";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import {
  createGuildTransaction,
  GuildWriteTransaction,
} from "#lib/guild-transaction.js";
import type { DatabaseClient } from "#lib/database/client.js";
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

export type { CachedOverride } from "#lib/prisma/repositories/PermissionRepository.js";
export type { AuditLogPayload } from "#lib/prisma/repositories/AuditRepository.js";
export type { ConfigHistoryEntry } from "#lib/prisma/repositories/ConfigHistoryRepository.js";
export type { ConfigOverrideEntry } from "#lib/prisma/repositories/ConfigOverrideRepository.js";

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
    await this.prisma.$transaction([
      this.prisma.blocklist.deleteMany({ where: { userId } }),
      this.prisma.auditLedger.deleteMany({ where: { userId } }),
      this.prisma.user.deleteMany({ where: { id: userId } }),
    ]);

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
