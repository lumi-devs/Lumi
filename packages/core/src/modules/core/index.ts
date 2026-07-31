import { Module, DefineModule } from "#lib/module-system/Module.js";
import { container, type Piece } from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { registerRpcHandler, rpcHandlers } from "#lib/rabbitmq/index.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import { resolver, ADDON_MODULES_ROOT } from "#lib/downloader/resolver.js";
import { Emojis } from "#lib/utilities/assets.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { s, type BaseValidator } from "@sapphire/shapeshift";

const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

/** Validate an RPC payload against its schema, throwing a uniform error on mismatch. */
function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: any) {
    throw new Error(`Bad payload: ${err.message}`);
  }
}

const GdprDeleteSchema = s.object({
  userId: SnowflakeSchema,
  requester: s.string().optional(),
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
  moduleName: s.string().lengthGreaterThanOrEqual(1),
});

@DefineModule({
  name: "core",
  displayName: "Core",
  description: "The built-in core module.",
  emoji: Emojis.SHIELD,
  version: "1.0.0",
  disableable: false,
})
export class CoreModule extends Module {
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, {
      ...options,
      name: "core",
      enabled: true,
            displayName: "Core",
      description: "The built-in core module.",
      emoji: Emojis.SHIELD,
    });
  }

  public override onLoad() {
    const result = super.onLoad();
    container.logger.info("[Core] Initializing Core RPC handlers...");

    registerRpcHandler(RPC_ACTIONS.gdprDelete, async (req) => {
      const { userId } = parsePayload(GdprDeleteSchema, req.data);
      await container.db.deleteUserData(userId);
      return { success: true };
    });

    registerRpcHandler(RPC_ACTIONS.repoAdd, async (req) => {
      const { name, url, branch } = parsePayload(RepoAddSchema, req.data);

      const service = getService("downloader");
      const repo = await service.addRepo(name, url, branch || "default");

      return { success: true, repo };
    });

    registerRpcHandler(RPC_ACTIONS.repoList, async () => {
      const repos = await container.db.downloader.readAllDownloaderRepos();
      return { repos };
    });

    registerRpcHandler(RPC_ACTIONS.repoModules, async (req) => {
      const { repoName } = parsePayload(RepoModulesSchema, req.data);

      const modules = await resolver.getModulesInRepo(repoName);

      const repo =
        await container.db.downloader.readDownloaderRepoWithModules(repoName);

      const installedMap = new Set(
        repo?.installedModules.map(
          (m: { moduleName: string }) => m.moduleName,
        ) || [],
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
      const { repoName, moduleName } = parsePayload(
        ModuleInstallSchema,
        req.data,
      );

      const repo = await container.db.downloader.readDownloaderRepo(repoName);
      if (!repo)
        throw new Error(`Repository ${repoName} not found in database.`);

      const installed =
        await container.db.downloader.readInstalledDownloaderModule(moduleName);
      const remoteModules = await resolver.getModulesInRepo(repoName);
      const remoteModule = remoteModules.find((m) => m.name === moduleName);

      if (!remoteModule)
        throw new Error(`Module ${moduleName} not found in repo ${repoName}.`);

      if (installed) {
        if (installed.version === remoteModule.version) {
          throw new Error(
            `Module **${moduleName}** (v${installed.version}) is already installed and up to date.`,
          );
        } else {
          throw new Error(
            `Module **${moduleName}** is already installed (v${installed.version}). Use \`,module update ${moduleName}\` to update to v${remoteModule.version}.`,
          );
        }
      }

      await resolver.installModule(repoName, moduleName);

      await container.db.downloader.writeInstalledDownloaderModule(
        repo.id,
        moduleName,
      );

      await container.moduleStore.discover(true);
      await container.moduleStore.loadModule(moduleName);
      return { success: true, moduleName };
    });

    registerRpcHandler(RPC_ACTIONS.moduleUninstall, async (req) => {
      const { moduleName } = parsePayload(ModuleUninstallSchema, req.data);

      await container.moduleStore.unload(moduleName);

      const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch (err: unknown) {
        container.logger.warn(
          `[Downloader] Could not remove ${targetPath}:`,
          err,
        );
      }

      await container.db.downloader.deleteInstalledDownloaderModule(moduleName);

      return { success: true, moduleName };
    });

    return result;
  }

  public override onUnload() {
    container.logger.info("[Core] Unloading Core RPC handlers...");
    rpcHandlers.delete(RPC_ACTIONS.gdprDelete);
    rpcHandlers.delete(RPC_ACTIONS.repoAdd);
    rpcHandlers.delete(RPC_ACTIONS.repoList);
    rpcHandlers.delete(RPC_ACTIONS.repoModules);
    rpcHandlers.delete(RPC_ACTIONS.moduleInstall);
    rpcHandlers.delete(RPC_ACTIONS.moduleUninstall);
    return super.onUnload();
  }
}
