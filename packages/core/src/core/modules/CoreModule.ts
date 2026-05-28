/* eslint-disable @typescript-eslint/member-ordering -- registerRpcHandler calls ordered by RPC command semantics, not class member order */
import { Module } from "../module-system/Module.js";
import { container, type Piece } from "@sapphire/framework";
import type { DownloaderService } from "#core/services/DownloaderService.js";
import { registerRpcHandler, deregisterRpcHandler } from "#lib/rabbit.js";
import {
  RPC_ACTIONS,
  type GdprDeletePayload,
  type RepoAddPayload,
  type RepoModulesPayload,
  type ModuleInstallPayload,
  type ModuleUninstallPayload,
} from "@ember/contracts";
import { resolver } from "../lib/downloader/resolver.js";
import {
  executeGdprDeletion,
  GdprDeletionError,
  RequesterType,
} from "../lib/gdpr.js";
import { EmberEmojis } from "#utilities/assets.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import "../sentry/breadcrumb.js";

const SnowflakeSchema = z.string().regex(/^\d{17,20}$/);

const GdprDeleteSchema: z.ZodType<GdprDeletePayload> = z.object({
  userId: SnowflakeSchema,
  requester: z.nativeEnum(RequesterType),
});

const RepoAddSchema: z.ZodType<RepoAddPayload> = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  branch: z.string().optional(),
});

const RepoModulesSchema: z.ZodType<RepoModulesPayload> = z.object({
  repoName: z.string().min(1),
});

const ModuleInstallSchema: z.ZodType<ModuleInstallPayload> = z.object({
  repoName: z.string().min(1),
  moduleName: z.string().min(1),
});

const ModuleUninstallSchema: z.ZodType<ModuleUninstallPayload> = z.object({
  moduleName: z.string().min(1),
});

export class CoreModule extends Module {
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, {
      ...options,
      name: "Core",
      enabled: true,
      isCore: true,
      displayName: "Core",
      description: "The built-in core module.",
      emoji: EmberEmojis.SHIELD,
    });
  }

  public override onLoad() {
    super.onLoad();
    container.logger.info("[Core] Initializing Core RPC handlers...");

    // ── GDPR Deletion Endpoint ───────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.gdprDelete, async (req) => {
      const parsed = GdprDeleteSchema.safeParse(req.data);
      if (!parsed.success)
        throw new Error(`Bad payload: ${parsed.error.message}`);
      const { userId, requester } = parsed.data;

      try {
        await executeGdprDeletion(userId, requester as RequesterType);
        return { success: true };
      } catch (err: unknown) {
        if (err instanceof GdprDeletionError) {
          return { success: false, failures: err.failures };
        }
        throw err;
      }
    });

    // ── 1. Add Repository ────────────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.repoAdd, async (req) => {
      const parsed = RepoAddSchema.safeParse(req.data);
      if (!parsed.success)
        throw new Error(`Bad payload: ${parsed.error.message}`);
      const { name, url, branch } = parsed.data;

      const service = container.stores
        .get("services")
        .get("downloader") as DownloaderService;
      const repo = await service.addRepo(name, url, branch || "default");

      return { success: true, repo };
    });

    // ── 2. List Repositories ─────────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.repoList, async () => {
      const repos = await container.db.downloader.readAllDownloaderRepos();
      return { repos };
    });

    // ── 3. List Modules in Repo ──────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.repoModules, async (req) => {
      const parsed = RepoModulesSchema.safeParse(req.data);
      if (!parsed.success)
        throw new Error(`Bad payload: ${parsed.error.message}`);
      const { repoName } = parsed.data;

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

    // ── 4. Install Module ────────────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.moduleInstall, async (req) => {
      const parsed = ModuleInstallSchema.safeParse(req.data);
      if (!parsed.success)
        throw new Error(`Bad payload: ${parsed.error.message}`);
      const { repoName, moduleName } = parsed.data;

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

    // ── 5. Uninstall Module ──────────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.moduleUninstall, async (req) => {
      const parsed = ModuleUninstallSchema.safeParse(req.data);
      if (!parsed.success)
        throw new Error(`Bad payload: ${parsed.error.message}`);
      const { moduleName } = parsed.data;

      await container.moduleStore.unload(moduleName);

      const targetPath = path.join(
        process.cwd(),
        "packages",
        "core",
        "src",
        "modules",
        moduleName,
      );

      try {
        await fs.unlink(targetPath);
      } catch (err: unknown) {
        container.logger.warn(
          `[Downloader] Could not unlink ${targetPath}:`,
          err,
        );
      }

      await container.db.downloader.deleteInstalledDownloaderModule(moduleName);

      return { success: true, moduleName };
    });
  }

  public override onUnload() {
    container.logger.info("[Core] Unloading Core RPC handlers...");
    deregisterRpcHandler(RPC_ACTIONS.gdprDelete);
    deregisterRpcHandler(RPC_ACTIONS.repoAdd);
    deregisterRpcHandler(RPC_ACTIONS.repoList);
    deregisterRpcHandler(RPC_ACTIONS.repoModules);
    deregisterRpcHandler(RPC_ACTIONS.moduleInstall);
    deregisterRpcHandler(RPC_ACTIONS.moduleUninstall);
    return super.onUnload();
  }
}
