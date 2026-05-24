/* eslint-disable @typescript-eslint/member-ordering -- registerRpcHandler calls ordered by RPC command semantics, not class member order */
import { Module } from "../module-system/Module.js";
import { container, type Piece } from "@sapphire/framework";
import type { DownloaderService } from "#core/services/DownloaderService.js";
import { registerRpcHandler } from "#lib/rabbit.js";
import { resolver } from "../lib/downloader/resolver.js";
import { executeGdprDeletion, RequesterType } from "../lib/gdpr.js";
import { EmberEmojis } from "#utilities/assets.js";
import { promises as fs } from "node:fs";
import path from "node:path";

import "../sentry/breadcrumb.js";

export class CoreModule extends Module {
  public registerServices() {}

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
    container.logger.info("[Core] Initializing Core RPC handlers...");

    // ── GDPR Deletion Endpoint ───────────────────────────────────────────
    registerRpcHandler("global.gdpr.delete", async (req) => {
      const { data } = req;
      const { userId, requester } = data as {
        userId: string;
        requester: RequesterType;
      };

      if (!userId || !requester) throw new Error("Missing userId or requester");

      // Fire and forget, don't block the RPC response, or await it if preferred.
      // Given it could be slow, we'll await it so the dashboard knows it finished.
      await executeGdprDeletion(userId, requester);
      return { success: true };
    });

    // ── 1. Add Repository ────────────────────────────────────────────────
    registerRpcHandler("downloader.repo.add", async (req) => {
      const { data } = req;
      const { name, url, branch } = data as {
        name: string;
        url: string;
        branch?: string;
      };

      if (!name || !url) throw new Error("Missing name or url");

      const service = container.stores
        .get("services")
        .get("downloader") as DownloaderService;
      const repo = await service.addRepo(name, url, branch || "master");

      return { success: true, repo };
    });

    // ── 2. List Repositories ─────────────────────────────────────────────
    registerRpcHandler("downloader.repo.list", async () => {
      const repos = await container.db.readAllDownloaderRepos();
      return { repos };
    });

    // ── 3. List Modules in Repo ──────────────────────────────────────────
    registerRpcHandler("downloader.repo.modules", async (req) => {
      const { data } = req;
      const { repoName } = data as { repoName: string };

      if (!repoName) throw new Error("Missing repoName");

      const modules = await resolver.getModulesInRepo(repoName);

      // Get installed modules for this repo to indicate status
      const repo = await container.db.readDownloaderRepoWithModules(repoName);

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
    registerRpcHandler("downloader.module.install", async (req) => {
      const { data } = req;
      const { repoName, moduleName } = data as {
        repoName: string;
        moduleName: string;
      };

      if (!repoName || !moduleName)
        throw new Error("Missing repoName or moduleName");

      const repo = await container.db.readDownloaderRepo(repoName);
      if (!repo)
        throw new Error(`Repository ${repoName} not found in database.`);

      await resolver.installModule(repoName, moduleName);

      // Register as installed
      await container.db.writeInstalledDownloaderModule(repo.id, moduleName);

      // Tell ModuleManager to discover and load it
      await container.moduleStore.discover();
      await container.moduleStore.loadModule(moduleName);
      return { success: true, moduleName };
    });

    // ── 5. Uninstall Module ──────────────────────────────────────────────
    registerRpcHandler("downloader.module.uninstall", async (req) => {
      const { data } = req;
      const { moduleName } = data as { moduleName: string };

      if (!moduleName) throw new Error("Missing moduleName");

      // Unload from runtime
      await container.moduleStore.unload(moduleName);

      // Remove symlink
      const targetPath = path.join(process.cwd(), "src", "modules", moduleName);

      try {
        await fs.unlink(targetPath);
      } catch (err: unknown) {
        container.logger.warn(
          `[Downloader] Could not unlink ${targetPath}:`,
          err,
        );
      }

      // Remove from DB
      await container.db.deleteInstalledDownloaderModule(moduleName);

      return { success: true, moduleName };
    });
  }
}
