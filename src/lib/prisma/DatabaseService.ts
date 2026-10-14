import { type ILogger } from "#src/shared/Index.ts";
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
import { DownloaderRepository } from "#src/admin/data/DownloaderRepository.js";
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
import { cacheStore } from "#src/lib/cache/CacheStore.js";
import { CacheKeys, CacheTTL } from "#src/lib/cache/Keys.js";

export type { ConfigHistoryEntry } from "#src/lib/prisma/repositories/ConfigHistoryRepository.js";
export type { ConfigOverrideEntry } from "#src/lib/prisma/repositories/ConfigOverrideRepository.js";

export class DatabaseService {
  public readonly global: GlobalRepository;
  public readonly config: ConfigRepository;
  public readonly configHistory: ConfigHistoryRepository;
  public readonly modules: ModuleRepository;
  public readonly guildKV: GuildKVRepository;
  public readonly access: AccessRepository;
  public readonly permissions: PermissionRepository;
  public readonly downloader: DownloaderRepository;
  public readonly audit: AuditRepository;
  public readonly moderation: ModerationRepository;
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
    logger: ILogger,
    reader: DatabaseClient = prisma,
  ) {
    this.global = new GlobalRepository(prisma, logger, this);
    this.configHistory = new ConfigHistoryRepository(prisma, logger, this);
    this.config = new ConfigRepository(prisma, logger, this, this.configHistory);
    this.modules = new ModuleRepository(prisma, logger, this, this.config);
    this.guildKV = new GuildKVRepository(prisma, logger, this);
    this.access = new AccessRepository(prisma, logger, this);
    this.permissions = new PermissionRepository(prisma, logger, this);
    this.downloader = new DownloaderRepository(prisma, logger, this);
    this.audit = new AuditRepository(prisma, logger, this);
    this.moderation = new ModerationRepository(prisma, logger, this, reader);
    this.configOverrides = new ConfigOverrideRepository(prisma, logger, this);
    this.afk = new AfkRepository(prisma, logger, this, reader);
    this.modNotes = new ModNoteRepository(prisma, logger, this);
    this.appeals = new AppealRepository(prisma, logger, this);
    this.security = new SecurityRepository(prisma, logger, this);
    this.tempvc = new TempVcRepository(prisma, logger, this);
    this.economy = new EconomyRepository(prisma, logger, this);
    this.leveling = new LevelRepository(prisma, logger, this);
    this.reactionRoles = new ReactionRoleRepository(prisma, logger, this);
    this.gdprExportJobs = new GdprExportJobRepository(prisma, logger, this);
    this.featureFlags = new FeatureFlagRepository(prisma, logger, this);
    this.sharedTokens = new SharedTokenRepository(prisma, logger, this);
  }

  public async ensureGuild(guildId: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });
  }

  public async ensureGuilds(guildIds: string[]): Promise<void> {
    if (guildIds.length === 0) return;
    await this.prisma.guild.createMany({
      data: guildIds.map((id) => ({ id })),
      skipDuplicates: true,
    });
  }

  public async countAllGuilds(): Promise<number> {
    return this.prisma.guild.count();
  }

  public async listAllGuildIds(): Promise<string[]> {
    const rows = await this.prisma.guild.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }

  public async purgeDepartedGuilds(currentGuildIds: string[]): Promise<string[]> {
    const departed = await this.prisma.guild.findMany({
      where: { id: { notIn: currentGuildIds } },
      select: { id: true },
    });
    if (departed.length === 0) return [];
    await this.prisma.guild.deleteMany({
      where: { id: { in: departed.map((r) => r.id) } },
    });
    return departed.map((row) => row.id);
  }

  public async publishBotStats(stats: Record<string, unknown>): Promise<void> {
    cacheStore.set(CacheKeys.botStats(), stats, CacheTTL.minute);
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
    return createGuildTransaction(guildId, this.prisma);
  }

  public async probePrisma(): Promise<number> {
    const start = performance.now();
    await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
    return performance.now() - start;
  }

  public async getPostgresStats(): Promise<{
    overview?: { size: string; uptime_secs: string } | undefined;
    tables: { relname: string; bytes: string; dead: string }[];
  }> {
    return { tables: [] };
  }
}
