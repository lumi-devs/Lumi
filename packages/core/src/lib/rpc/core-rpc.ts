import { container } from "@sapphire/framework";
import { getUtility } from "#lib/module-system/Utility.js";
import { registerRpcHandler } from "#lib/rpc/dispatch.js";
import {
  PageSchema,
  PageSizeSchema,
  SnowflakeSchema,
  parsePayload,
  paginate,
} from "#lib/rpc/validation.js";
import {
  RPC_ACTIONS,
  type RpcRequest,
  type SystemShardsResponse,
} from "@lumi/contracts";
import { DEFAULT_CLUSTER_NAME, readClusterShards } from "@lumi/sharding";
import { getClusterName } from "#lib/env.js";
import { resolver } from "#lib/downloader/resolver.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { executeGdprDeletion, executeGdprExport } from "#lib/gdpr.js";
import { s } from "@sapphire/shapeshift";

const SafeNameSchema = s.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);

// Returns the validated actor id so callers can attribute writes to them.
// `req.actorId` is only meaningful because the RPC transport authenticated the
// caller with RPC_INTERNAL_TOKEN (see lib/rpc/http-server.ts) - on its own it
// is an attacker-suppliable field, and bot-owner snowflakes are public.
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
  revision: s.string().lengthGreaterThanOrEqual(4).optional(),
});

const ModuleUninstallSchema = s.object({
  moduleName: SafeNameSchema,
});

const ModuleRollbackSchema = s.object({
  moduleName: SafeNameSchema,
  revision: s.string().lengthGreaterThanOrEqual(4),
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

const SystemModuleClearSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
});

const SystemIdentitySchema = s.object({
  inviteUrl: s.string().url().nullable().optional(),
  supportGuildId: SnowflakeSchema.nullable().optional(),
});

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
    const { failedModules } = await executeGdprDeletion(userId, requester);
    return failedModules.length > 0
      ? { success: false, failedModules }
      : { success: true };
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
    const service = getUtility("downloader");
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
    const installedMap = new Map(
      repo?.installedModules.map(
        (m: { moduleName: string; commit: string | null; pinned: boolean }) => [
          m.moduleName,
          m,
        ],
      ) || [],
    );
    return {
      repoName,
      modules: modules.map((m) => {
        const installed = installedMap.get(m.name);
        return {
          ...m,
          isInstalled: !!installed,
          commit: installed?.commit ?? null,
          pinned: installed?.pinned ?? false,
        };
      }),
    };
  });

  registerRpcHandler(RPC_ACTIONS.moduleInstall, async (req) => {
    requireBotOwner(req);
    const { repoName, moduleName, revision } = parsePayload(
      ModuleInstallSchema,
      req.data,
    );
    await getUtility("downloader").installModule(repoName, moduleName, revision);
    return { success: true, moduleName };
  });

  registerRpcHandler(RPC_ACTIONS.moduleUninstall, async (req) => {
    requireBotOwner(req);
    const { moduleName } = parsePayload(ModuleUninstallSchema, req.data);
    await getUtility("downloader").uninstallModule(moduleName);
    return { success: true, moduleName };
  });

  registerRpcHandler(RPC_ACTIONS.moduleRollback, async (req) => {
    requireBotOwner(req);
    const { moduleName, revision } = parsePayload(ModuleRollbackSchema, req.data);
    const result = await getUtility("downloader").rollbackModule(moduleName, revision);
    return { success: true, moduleName, commit: result.commit };
  });

  // Bot Owner system panel.
  registerRpcHandler(RPC_ACTIONS.systemDashboardGet, async (req) => {
    requireBotOwner(req);
    const [global, moduleStates, shardSnapshot] = await Promise.all([
      container.db.global.getGlobalConfig(),
      container.db.modules.getGlobalModuleStatesDetailed(),
      readClusterShards({
        redis: container.redis,
        clusterName: getClusterName() ?? DEFAULT_CLUSTER_NAME,
      }),
    ]);
    const moduleStore = container.stores.get("modules");
    const allModules = moduleStore
      .loaded()
      .map((m) => ({
        name: m.meta.name,
        displayName: m.meta.displayName,
        emoji: m.meta.emoji,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
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
      allModules,
      guildCount: shardSnapshot.shards.reduce(
        (sum, shard) => sum + shard.guildCount,
        0,
      ),
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

  registerRpcHandler(RPC_ACTIONS.systemModuleClear, async (req) => {
    requireBotOwner(req);
    const { moduleName } = parsePayload(SystemModuleClearSchema, req.data);
    await container.db.modules.clearModuleGlobalState(moduleName);
    return { success: true, moduleName };
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
      shardCount: snapshot.shardCount,
      observedAt: new Date(snapshot.observedAt).toISOString(),
      replicas: snapshot.replicas.map((r) => ({
        replicaId: r.replicaId,
        reportingShardIds: r.reportingShardIds,
      })),
      shards: snapshot.shards.map((s) => ({
        shardId: s.shardId,
        replicaId: s.replicaId,
        status: s.status,
        ping: s.ping,
        guildCount: s.guildCount,
        lastHeartbeatAt: new Date(s.updatedAt).toISOString(),
      })),
      missingShardIds: snapshot.missingShardIds,
    } satisfies SystemShardsResponse;
  });
}
