import { Service } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import { type Piece } from "@sapphire/framework";
import {
  resolver,
  ADDON_MODULES_ROOT,
  MODULE_ROOT,
} from "#lib/downloader/resolver.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errorFrom } from "#lib/utilities/errors.js";

const execFileAsync = promisify(execFile);

export class ModuleAlreadyInstalledError extends Error {
  public readonly moduleName: string;
  public constructor(moduleName: string) {
    super(`Module **${moduleName}** is already installed.`);
    this.moduleName = moduleName;
    this.name = "ModuleAlreadyInstalledError";
  }
}

@ApplyOptions<Piece.Options>({ name: "downloader" })
export class DownloaderService extends Service {
  public override async onLoad() {
    super.onLoad();
    await this.syncInstalledModulesOnStartup().catch((err) => {
      this.container.logger.error(
        "[DownloaderService] Failed to sync installed modules on startup:",
        err,
      );
    });
  }

  public async syncInstalledModulesOnStartup() {
    await fs.mkdir(ADDON_MODULES_ROOT, { recursive: true });
    const installed =
      await this.container.db.downloader.readAllInstalledDownloaderModulesWithRepo();
    if (!installed.length) return;

    let restoredAny = false;
    for (const item of installed) {
      const sourcePath = path.join(
        MODULE_ROOT,
        item.repo.name,
        item.moduleName,
      );
      const targetPath = path.join(ADDON_MODULES_ROOT, item.moduleName);

      try {
        const sourceExists = await fs
          .access(sourcePath)
          .then(() => true)
          .catch(() => false);
        if (!sourceExists) {
          this.container.logger.info(
            `[DownloaderService] Restoring repo ${item.repo.name} for module ${item.moduleName}...`,
          );
          await resolver
            .addRepo(item.repo.name, item.repo.url, item.repo.branch || "default")
            .catch(() => {});
        }

        const targetExists = await fs
          .access(targetPath)
          .then(() => true)
          .catch(() => false);
        if (
          !targetExists &&
          (await fs
            .access(sourcePath)
            .then(() => true)
            .catch(() => false))
        ) {
          await fs.rm(targetPath, { recursive: true, force: true }).catch(() => {});
          await fs.symlink(sourcePath, targetPath, "dir");
          restoredAny = true;
          this.container.logger.info(
            `[DownloaderService] Restored addon symlink for ${item.moduleName}`,
          );
        }
      } catch (err) {
        this.container.logger.warn(
          `[DownloaderService] Failed to restore symlink for ${item.moduleName}:`,
          err,
        );
      }
    }

    if (restoredAny) {
      await this.container.moduleStore.discover(true);
    }
  }

  public async installModule(repoName: string, moduleName: string) {
    const repo =
      await this.container.db.downloader.readDownloaderRepo(repoName);
    if (!repo) {
      throw new Error(
        `Repository **${repoName}** has not been added. Use \`,repo add\` first.`,
      );
    }

    const existing =
      await this.container.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (existing) {
      throw new ModuleAlreadyInstalledError(moduleName);
    }

    const info = await resolver.installModule(repoName, moduleName);
    try {
      this.container.logger.info("[DownloaderService] Discovering modules...");
      await this.container.moduleStore.discover(true);
      this.container.logger.info(
        `[DownloaderService] Loading module ${moduleName}...`,
      );
      await this.container.moduleStore.loadModule(moduleName);
      this.container.logger.info("[DownloaderService] Syncing commands...");
      await this.syncApplicationCommands();
      await this.container.db.downloader.writeInstalledDownloaderModule(
        repo.id,
        moduleName,
        info.version,
      );
    } catch (err: unknown) {
      await this.container.moduleStore
        .unload(moduleName)
        .catch(() => undefined);
      await fs
        .unlink(path.join(ADDON_MODULES_ROOT, moduleName))
        .catch(() => undefined);
      throw err;
    }
  }

  public async uninstallModule(moduleName: string) {
    const installedCheck =
      await this.container.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installedCheck) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }

    try {
      await this.container.moduleStore.unload(moduleName);
    } catch (err: unknown) {
      const msg = errorFrom(err).message;
      if (!msg.includes("does not exist")) {
        throw err;
      }
    }

    const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);
    await fs.rm(targetPath, { recursive: true, force: true }).catch((err) => {
      this.container.logger.error(
        `[DownloaderService] failed to remove symlink/directory at ${targetPath}:`,
        err,
      );
    });

    await this.container.db.downloader.deleteInstalledDownloaderModule(
      moduleName,
    );
  }

  public async addRepo(name: string, url: string, branch: string) {
    await resolver.addRepo(name, url, branch);
    await this.container.db.downloader.writeDownloaderRepo(name, url, branch);
  }

  public async updateRepo(name: string) {
    const repo = await this.container.db.downloader.readDownloaderRepo(name);
    if (!repo) {
      throw new Error(
        `Repository **${name}** not found. Add it first using \`,repo add\`.`,
      );
    }
    await resolver.addRepo(repo.name, repo.url, repo.branch);
  }

  public listRepos() {
    return this.container.db.downloader.readAllDownloaderRepos();
  }

  public getModulesInRepo(repoName: string) {
    return resolver.getModulesInRepo(repoName);
  }

  public async getRepoStatus(repoName: string): Promise<{ lastCommit: string | null; lastCommitTime: string | null }> {
    const repoPath = path.join(MODULE_ROOT, repoName);
    try {
      const { stdout } = await execFileAsync("git", ["-C", repoPath, "log", "-1", "--format=%h|%cr"]);
      const [hash, time] = stdout.trim().split("|");
      return { lastCommit: hash || null, lastCommitTime: time || null };
    } catch {
      return { lastCommit: null, lastCommitTime: null };
    }
  }

  public async updateModule(
    moduleName: string,
  ): Promise<{ updated: boolean; changelog?: string; needsRestart?: boolean }> {
    const installed =
      await this.container.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }

    const repo = await this.container.db.downloader.readDownloaderRepoById(
      installed.repoId,
    );
    if (!repo) {
      throw new Error(
        `Repository for module **${moduleName}** could not be found.`,
      );
    }

    const repoPath = path.join(MODULE_ROOT, repo.name);
    const branch = repo.branch || "default";

    try {
      await fs.access(repoPath);
    } catch {
      await this.updateRepo(repo.name);
    }

    const fetchFailed = await execFileAsync("git", [
      "-C",
      repoPath,
      "fetch",
      "origin",
    ])
      .then(() => false)
      .catch((err: NodeJS.ErrnoException & { stderr?: string }) => {
        this.container.logger.warn(
          `[DownloaderService] git fetch failed for ${repo.name}; update check uses stale refs: ${(err.stderr ?? err.message).trim()}`,
        );
        return true;
      });

    const localHash = (
      await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"])
    ).stdout.trim();

    const remoteRefResult = await execFileAsync("git", [
      "-C",
      repoPath,
      "rev-parse",
      "--abbrev-ref",
      "@{u}",
    ]).catch(() => ({ stdout: "" }));
    const remoteRef = remoteRefResult.stdout.trim();

    const targetRef =
      remoteRef && !remoteRef.includes("@{u}")
        ? remoteRef
        : `origin/${branch === "default" ? "master" : branch}`;

    const { stdout: remoteOut } = await execFileAsync("git", [
      "-C",
      repoPath,
      "rev-parse",
      targetRef,
    ]);
    const remoteHash = remoteOut.trim();

    const installedHash = installed.commit ?? null;
    const upToDate =
      installedHash !== null &&
      installedHash === remoteHash &&
      localHash === remoteHash;

    if (upToDate) {
      return { updated: false };
    }

    if (fetchFailed && localHash === remoteHash) {
      await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
        repo.id,
        moduleName,
        remoteHash,
      );
      return { updated: false };
    }

    const { stdout: logOut } = await execFileAsync("git", [
      "-C",
      repoPath,
      "log",
      "--oneline",
      `HEAD..${targetRef}`,
    ]).catch(() => ({ stdout: "" }));
    const changelog = logOut.trim();

    const pullArgs = ["-C", repoPath, "pull"];
    if (branch !== "default") pullArgs.push("origin", branch);
    await execFileAsync("git", pullArgs).catch(
      (err: NodeJS.ErrnoException & { stderr?: string }) => {
        throw new Error(
          `Git pull failed: ${(err.stderr ?? err.message).trim()}`,
        );
      },
    );

    await resolver.installModule(repo.name, moduleName);

    await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
      repo.id,
      moduleName,
      remoteHash,
    );

    this.container.logger.info(
      `[DownloaderService] ${moduleName} updated on disk; restart required to apply.`,
    );
    return { updated: true, changelog, needsRestart: true };
  }

  public getInstalledModules() {
    return this.container.db.downloader.readAllInstalledDownloaderModules();
  }

  public getInstalledModulesDetailed() {
    return this.container.db.downloader.readAllInstalledDownloaderModulesWithRepo();
  }

  public async removeRepo(name: string) {
    const repo =
      await this.container.db.downloader.readDownloaderRepoWithModules(name);
    if (!repo) {
      throw new Error(`Repository **${name}** not found.`);
    }

    for (const mod of repo.installedModules) {
      try {
        await this.uninstallModule(mod.moduleName);
      } catch (err: unknown) {
        this.container.logger.warn(
          `[DownloaderService] Failed to uninstall ${mod.moduleName} during repo removal:`,
          err,
        );
      }
    }

    await this.container.db.downloader.deleteDownloaderRepo(name);
  }

  public async syncApplicationCommands() {
    const { client } = this.container;
    if (!client.application) {
      this.container.logger.warn(
        "[DownloaderService] client.application not ready; slash command sync skipped",
      );
      return;
    }

    const commandStore = this.container.stores.get("commands");

    interface ApiCall {
      registerOptions: { guildIds?: string[] };
      builtData: object;
    }
    interface RegistryInternal {
      apiCalls?: ApiCall[];
    }

    for (const command of commandStore.values()) {
      if (typeof command.registerApplicationCommands !== "function") continue;
      const registry = command.applicationCommandRegistry;
      const { apiCalls } = registry as unknown as RegistryInternal;
      if (!apiCalls?.length) {
        try {
          await command.registerApplicationCommands(registry);
        } catch (err: unknown) {
          this.container.logger.error(
            `[DownloaderService] registerApplicationCommands failed for ${command.name}:`,
            err,
          );
        }
      }
    }

    const globalData: object[] = [];
    const guildData = new Map<string, object[]>();

    for (const command of commandStore.values()) {
      const apiCalls =
        (command.applicationCommandRegistry as unknown as RegistryInternal)
          .apiCalls ?? [];
      for (const call of apiCalls) {
        if (call.registerOptions?.guildIds?.length) {
          for (const guildId of call.registerOptions.guildIds) {
            const arr = guildData.get(guildId) ?? [];
            arr.push(call.builtData);
            guildData.set(guildId, arr);
          }
        } else {
          globalData.push(call.builtData);
        }
      }
    }

    if (globalData.length) {
      await client.application.commands.set(
        globalData as Parameters<typeof client.application.commands.set>[0],
      );
      this.container.logger.info(
        `[DownloaderService] Synced ${globalData.length} global application commands.`,
      );
    }
    for (const [guildId, data] of guildData) {
      await client.application.commands.set(
        data as Parameters<typeof client.application.commands.set>[0],
        guildId,
      );
      this.container.logger.info(
        `[DownloaderService] Synced ${data.length} commands for guild ${guildId}.`,
      );
    }
  }
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    downloader: DownloaderService;
  }
}
