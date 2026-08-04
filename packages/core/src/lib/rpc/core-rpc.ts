import { container } from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { registerRpcHandler } from "#lib/rabbitmq/index.js";
import { RPC_ACTIONS, type RpcRequest } from "@lumi/contracts";
import { resolver, ADDON_MODULES_ROOT } from "#lib/downloader/resolver.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { s, type BaseValidator } from "@sapphire/shapeshift";

const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

const SafeNameSchema = s.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);

function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: any) {
    throw new Error(`Bad payload: ${err.message}`);
  }
}

function requireBotOwner(req: RpcRequest<unknown>): void {
  if (!req.actorId || !PermitResolver.isBotOwner(req.actorId)) {
    throw new Error("Bot Owner authorization required for this action.");
  }
}

const GdprDeleteSchema = s.object({
  userId: SnowflakeSchema,
  requester: s.enum(["DISCORD_DELETED_USER", "OWNER", "USER", "USER_STRICT"]).optional(),
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

export function initCoreRpcHandlers() {
  container.logger.info("[CoreSystem] Initializing Core RPC handlers...");

  registerRpcHandler(RPC_ACTIONS.gdprDelete, async (req) => {
    requireBotOwner(req);
    const { userId } = parsePayload(GdprDeleteSchema, req.data);
    await container.db.deleteUserData(userId);
    return { success: true };
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
    await container.db.downloader.writeInstalledDownloaderModule(repo.id, moduleName);
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

  // Bot Owner System Panel (dashboard.md §9A / §10).
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
}
