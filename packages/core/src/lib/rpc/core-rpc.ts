import { container } from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { registerRpcHandler } from "#lib/rabbitmq/index.js";
import {
  RPC_ACTIONS,
  type RpcRequest,
  type SystemShardsResponse,
} from "@lumi/contracts";
import { DEFAULT_CLUSTER_NAME, readClusterShards } from "@lumi/sharding";
import { getClusterName } from "#lib/env.js";
import { resolver, ADDON_MODULES_ROOT } from "#lib/downloader/resolver.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { executeGdprDeletion, executeGdprExport } from "#lib/gdpr.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { s, type BaseValidator } from "@sapphire/shapeshift";

const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

const SafeNameSchema = s.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);

function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Bad payload: ${msg}`);
  }
}

// Returns the validated actor id so callers can attribute writes to them.
function requireBotOwner(req: RpcRequest<unknown>): string {
  if (!req.actorId || !PermitResolver.isBotOwner(req.actorId)) {
    throw new Error("Bot Owner authorization required for this action.");
  }
  return req.actorId;
}

/** A user may always export their own data; exporting someone else's requires Bot Owner. */
function requireSelfOrBotOwner(req: RpcRequest<unknown>, userId: string): void {
  if (!req.actorId) throw new Error("actorId is required");
  if (req.actorId === userId) return;
  if (PermitResolver.isBotOwner(req.actorId)) return;
  throw new Error("Not authorized to export this user's data.");
}

const GdprDeleteSchema = s.object({
  userId: SnowflakeSchema,
  requester: s.enum(["DISCORD_DELETED_USER", "OWNER", "USER", "USER_STRICT"]).optional(),
});

const GdprExportSchema = s.object({
  userId: SnowflakeSchema,
});

const RepoAddSchema = s.object({
  name: s.string().lengthGreaterThanOrEqual(1),
  url: s.string().url(),
  branch: s.string().optional(),
});

const RepoModulesSchema = s.object({
  repoName: s.string().lengthGreaterThanOrEqual(1),
});

const ModuleInstallSchema = s.object({
  repoName: s.string().lengthGreaterThanOrEqual(1),
  moduleName: s.string().lengthGreaterThanOrEqual(1),
});

const ModuleUninstallSchema = s.object({
  moduleName: SafeNameSchema,
});

const SystemMaintenanceSchema = s.object({
  maintenanceMode: s.boolean(),
  maintenanceMessage: s.string().optional(),
});

const SystemModuleToggleSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  enabled: s.boolean(),
  reason: s.string().optional(),
});

const SystemIdentitySchema = s.object({
  inviteUrl: s.string().url().nullable().optional(),
  supportGuildId: SnowflakeSchema.nullable().optional(),
});

const MAX_PAGE_SIZE = 100;
const PageSchema = s.number().int().greaterThanOrEqual(1).optional();
const PageSizeSchema = s
  .number()
  .int()
  .greaterThanOrEqual(1)
  .lessThanOrEqual(MAX_PAGE_SIZE)
  .optional();

const SystemAuditListSchema = s.object({
  guildId: SnowflakeSchema.optional(),
  userId: SnowflakeSchema.optional(),
  action: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(128).optional(),
  platform: s.enum(["discord", "web"] as const).optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

const SystemBlocklistListSchema = s.object({
  page: PageSchema,
  pageSize: PageSizeSchema,
});

const SystemBlocklistAddSchema = s.object({
  userId: SnowflakeSchema,
  reason: s.string().lengthLessThanOrEqual(500).optional(),
});

const SystemBlocklistRemoveSchema = s.object({
  userId: SnowflakeSchema,
});

function paginate(filter: { page?: number; pageSize?: number }) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function initCoreRpcHandlers() {
  container.logger.info("[CoreSystem] Initializing Core RPC handlers...");

  // Self-check only — tells the caller whether *their own* actorId is a bot
  // owner, so the dashboard can defer to `PermitResolver.isBotOwner`'s
  // application-owner fallback instead of keeping its own env-var list.
  registerRpcHandler(RPC_ACTIONS.authWhoAmI, (req) => {
    return { isBotOwner: req.actorId ? PermitResolver.isBotOwner(req.actorId) : false };
  });

  registerRpcHandler(RPC_ACTIONS.gdprDelete, async (req) => {
    requireBotOwner(req);
    const { userId, requester } = parsePayload(GdprDeleteSchema, req.data);
    await executeGdprDeletion(userId, requester);
    return { success: true };
  });

  registerRpcHandler(RPC_ACTIONS.gdprExport, async (req) => {
    const { userId } = parsePayload(GdprExportSchema, req.data);
    requireSelfOrBotOwner(req, userId);
    const data = await executeGdprExport(userId);
    return { success: true, data };
  });

  registerRpcHandler(RPC_ACTIONS.repoAdd, async (req) => {
    requireBotOwner(req);
    const { name, url, branch } = parsePayload(RepoAddSchema, req.data);
    const service = getService("downloader");
    const repo = await service.addRepo(name, url, branch || "default");
    return { success: true, repo };
  });

  registerRpcHandler(RPC_ACTIONS.repoList, async (req) => {
    requireBotOwner(req);
    const repos = await container.db.downloader.readAllDownloaderRepos();
    return { repos };
  });

  registerRpcHandler(RPC_ACTIONS.repoModules, async (req) => {
    requireBotOwner(req);
    const { repoName } = parsePayload(RepoModulesSchema, req.data);
    const modules = await resolver.getModulesInRepo(repoName);
    const repo = await container.db.downloader.readDownloaderRepoWithModules(repoName);
    const installedMap = new Set(
      repo?.installedModules.map((m: { moduleName: string }) => m.moduleName) || [],
    );
    return {
      repoName,
      modules: modules.map((m) => ({
        ...m,
        isInstalled: installedMap.has(m.name),
      })),
    };
  });

  registerRpcHandler(RPC_ACTIONS.moduleInstall, async (req) => {
    requireBotOwner(req);
    const { repoName, moduleName } = parsePayload(ModuleInstallSchema, req.data);
    const repo = await container.db.downloader.readDownloaderRepo(repoName);
    if (!repo) throw new Error(`Repository ${repoName} not found in database.`);

    const installed = await container.db.downloader.readInstalledDownloaderModule(moduleName);
    const remoteModules = await resolver.getModulesInRepo(repoName);
    const remoteModule = remoteModules.find((m) => m.name === moduleName);

    if (!remoteModule) throw new Error(`Module ${moduleName} not found in repo ${repoName}.`);
    if (installed) {
      if (installed.version === remoteModule.version) {
        throw new Error(`Module **${moduleName}** (v${installed.version}) is already installed.`);
      }
    }

    await resolver.installModule(repoName, moduleName);
    await container.db.downloader.writeInstalledDownloaderModule(
      repo.id,
      moduleName,
      remoteModule.version,
    );
    await container.moduleStore.discover(true);
    await container.moduleStore.loadModule(moduleName);
    return { success: true, moduleName };
  });

  registerRpcHandler(RPC_ACTIONS.moduleUninstall, async (req) => {
    requireBotOwner(req);
    const { moduleName } = parsePayload(ModuleUninstallSchema, req.data);
    await container.moduleStore.unload(moduleName);
    const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch (err: unknown) {
      container.logger.debug(
        `[rpc] Failed to remove addon files at ${targetPath}: ${String(err)}`,
      );
    }
    await container.db.downloader.deleteInstalledDownloaderModule(moduleName);
    return { success: true, moduleName };
  });

  // Bot Owner system panel.
  registerRpcHandler(RPC_ACTIONS.systemDashboardGet, async (req) => {
    requireBotOwner(req);
    const [global, moduleStates] = await Promise.all([
      container.db.global.getGlobalConfig(),
      container.db.modules.getGlobalModuleStatesDetailed(),
    ]);
    return {
      global: {
        botName: global.botName,
        defaultPrefix: global.defaultPrefix,
        maintenanceMode: global.maintenanceMode,
        maintenanceMessage: global.maintenanceMessage,
        inviteUrl: global.inviteUrl,
        supportGuildId: global.supportGuildId,
      },
      moduleStates,
      guildCount: container.client.guilds.cache.size,
    };
  });

  registerRpcHandler(RPC_ACTIONS.systemMaintenanceSet, async (req) => {
    requireBotOwner(req);
    const { maintenanceMode, maintenanceMessage } = parsePayload(
      SystemMaintenanceSchema,
      req.data,
    );
    const global = await container.db.global.setMaintenanceMode(
      maintenanceMode,
      maintenanceMessage,
    );
    return { success: true, maintenanceMode: global.maintenanceMode };
  });

  registerRpcHandler(RPC_ACTIONS.systemModuleToggle, async (req) => {
    requireBotOwner(req);
    const { moduleName, enabled, reason } = parsePayload(
      SystemModuleToggleSchema,
      req.data,
    );
    await container.db.modules.setModuleGlobalEnabled(
      moduleName,
      enabled,
      reason,
    );
    return { success: true, moduleName, enabled };
  });

  registerRpcHandler(RPC_ACTIONS.systemIdentitySet, async (req) => {
    requireBotOwner(req);
    const { inviteUrl, supportGuildId } = parsePayload(
      SystemIdentitySchema,
      req.data,
    );
    const global = await container.db.global.updateGlobalConfig({
      ...(inviteUrl !== undefined && { inviteUrl }),
      ...(supportGuildId !== undefined && { supportGuildId }),
    });
    return {
      success: true,
      inviteUrl: global.inviteUrl,
      supportGuildId: global.supportGuildId,
    };
  });

  // Unlike `guild.audit.list`, this reads the ledger across every guild, so it
  // stays bot-owner only even when a `guildId` filter narrows it to one.
  registerRpcHandler(RPC_ACTIONS.systemAuditList, async (req) => {
    requireBotOwner(req);
    const filter = parsePayload(SystemAuditListSchema, req.data ?? {});
    const { page, pageSize, skip, take } = paginate(filter);

    const { entries, total } = await container.db.audit.listAuditLogs({
      guildId: filter.guildId,
      userId: filter.userId,
      action: filter.action,
      platform: filter.platform,
      skip,
      take,
    });

    return {
      entries: entries.map((e) => ({
        id: e.id,
        guildId: e.guildId,
        userId: e.userId,
        action: e.action,
        platform: e.platform,
        details: e.details,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });

  registerRpcHandler(RPC_ACTIONS.systemBlocklistList, async (req) => {
    requireBotOwner(req);
    const filter = parsePayload(SystemBlocklistListSchema, req.data ?? {});
    const { page, pageSize, skip, take } = paginate(filter);

    const { entries, total } = await container.db.access.listBlocklist(null, {
      skip,
      take,
    });

    return {
      entries: entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        reason: e.reason,
        blockedBy: e.blockedBy,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });

  registerRpcHandler(RPC_ACTIONS.systemBlocklistAdd, async (req) => {
    const actorId = requireBotOwner(req);
    const { userId, reason } = parsePayload(SystemBlocklistAddSchema, req.data);
    if (PermitResolver.isBotOwner(userId)) {
      throw new Error("Cannot blocklist a bot owner");
    }
    if (await container.db.access.isUserBlocklisted(userId, null)) {
      throw new Error(`${userId} is already blocklisted globally`);
    }
    await container.db.access.addBlocklistEntry(userId, actorId, reason, null);
    return { success: true, userId };
  });

  registerRpcHandler(RPC_ACTIONS.systemBlocklistRemove, async (req) => {
    requireBotOwner(req);
    const { userId } = parsePayload(SystemBlocklistRemoveSchema, req.data);
    await container.db.access.removeBlocklistEntry(userId, null);
    return { success: true, userId };
  });

  // Answered from shared Redis rather than this process's own `client.ws`: the
  // RPC lands on whichever worker picks it up, which owns at most its own slice
  // of the shard range.
  registerRpcHandler(RPC_ACTIONS.systemShardsGet, async (req) => {
    requireBotOwner(req);
    const snapshot = await readClusterShards({
      redis: container.redis,
      clusterName: getClusterName() ?? DEFAULT_CLUSTER_NAME,
    });

    return {
      clusterName: snapshot.clusterName,
      clustered: snapshot.clustered,
      epoch: snapshot.epoch,
      assignedAt: snapshot.assignedAt
        ? new Date(snapshot.assignedAt).toISOString()
        : null,
      shardCount: snapshot.shardCount,
      observedAt: new Date(snapshot.observedAt).toISOString(),
      replicas: snapshot.replicas.map((r) => ({
        replicaId: r.replicaId,
        lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null,
        ready: r.ready,
        assignedShardIds: r.assignedShardIds,
        reportingShardIds: r.reportingShardIds,
      })),
      shards: snapshot.shards.map((s) => ({
        shardId: s.shardId,
        replicaId: s.replicaId,
        status: s.status,
        ping: s.ping,
        guildCount: s.guildCount,
        lastHeartbeatAt: new Date(s.updatedAt).toISOString(),
        session: s.session,
      })),
      missingShardIds: snapshot.missingShardIds,
    } satisfies SystemShardsResponse;
  });
}
