import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import { type Piece } from "@sapphire/framework";
import {
  resolver,
  ADDON_MODULES_ROOT,
  MODULE_ROOT,
} from "#core/lib/downloader/resolver.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errorFrom } from "#utilities/errors.js";
import { isAutoRestartEnabled } from "#core/lib/restart.js";

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
  public async installModule(repoName: string, moduleName: string) {
    const repo =
      await this.container.db.downloader.readDownloaderRepo(repoName);
    if (!repo) {
      throw new Error(
        `Repository **${repoName}** has not been added. Use \`/repo add\` first.`,
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
    await this.container.db.downloader.writeInstalledDownloaderModule(
      repo.id,
      moduleName,
      info.version,
    );

    this.container.logger.info("[DownloaderService] Discovering modules...");
    await this.container.moduleStore.discover(true);
    this.container.logger.info(
      `[DownloaderService] Loading module ${moduleName}...`,
    );
    await this.container.moduleStore.loadModule(moduleName);
    this.container.logger.info("[DownloaderService] Syncing commands...");
    await this.syncApplicationCommands();
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
      // "does not exist" is the expected case when the module was never loaded
      // into the store (e.g. it was registered but never onLoaded). Only
      // re-throw genuine unexpected errors.
      const msg = errorFrom(err).message;
      if (!msg.includes("does not exist")) {
        throw err;
      }
    }

    const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);
    try {
      await fs.unlink(targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.container.logger.error(
          `[DownloaderService] failed to remove symlink:`,
          err,
        );
      }
    }

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
    // addRepo in resolver pulls the latest branch if it already exists
    await resolver.addRepo(repo.name, repo.url, repo.branch);
  }

  public async listRepos() {
    return this.container.db.downloader.readAllDownloaderRepos();
  }

  public async getModulesInRepo(repoName: string) {
    return resolver.getModulesInRepo(repoName);
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

    // Auto-restore if directory went missing (e.g., ephemeral container wipe)
    try {
      await fs.access(repoPath);
    } catch {
      await this.updateRepo(repo.name);
    }

    // 1. Fetch from remote. A failed fetch means we only know the stale local
    //    refs — surface it via log so an "up-to-date" result is never silently
    //    based on unreachable-remote state.
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

    // 2. Resolve the remote hash from the tracked upstream (or origin/<branch>).
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

    // 3. "Needs update" compares what we actually have installed/loaded
    //    (the recorded commit) against the remote — NOT the disk HEAD, which can
    //    drift from the loaded module (e.g. an out-of-band `,repo update` pulled
    //    the clone while the live module stayed stale). A null recorded commit
    //    (installed before commit tracking) forces a reload to resync.
    const installedHash = installed.commit ?? null;
    const upToDate =
      installedHash !== null &&
      installedHash === remoteHash &&
      localHash === remoteHash;

    if (upToDate) {
      return { updated: false };
    }

    if (fetchFailed && localHash === remoteHash) {
      // Couldn't reach the remote and disk already matches the (stale) ref —
      // nothing actionable; reconcile the recorded commit so we stop re-pulling.
      await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
        repo.id,
        moduleName,
        remoteHash,
      );
      return { updated: false };
    }

    // 4. Extract changelog (git log --oneline HEAD..remoteRef)
    const { stdout: logOut } = await execFileAsync("git", [
      "-C",
      repoPath,
      "log",
      "--oneline",
      `HEAD..${targetRef}`,
    ]).catch(() => ({ stdout: "" }));
    const changelog = logOut.trim();

    // 5. Perform pull
    const pullArgs = ["-C", repoPath, "pull"];
    if (branch !== "default") pullArgs.push("origin", branch);
    await execFileAsync("git", pullArgs).catch(
      (err: NodeJS.ErrnoException & { stderr?: string }) => {
        throw new Error(
          `Git pull failed: ${(err.stderr ?? err.message).trim()}`,
        );
      },
    );

    // 6. Re-run resolver installation (isolated dependencies + symlinks)
    await resolver.installModule(repo.name, moduleName);

    // 7. Record the new commit BEFORE applying, so a restart-on-update boots
    //    straight into the new code without re-detecting it as pending.
    await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
      repo.id,
      moduleName,
      remoteHash,
    );

    // 8. Apply the new code. Bun's ESM loader can't purge a module's transitive
    //    imports (see lib/restart.ts), so an in-process reload would only swap the
    //    entry pieces and keep running the old `lib/` — the bug behind "I updated
    //    but it still runs old code". When auto-restart is enabled the caller
    //    restarts the process to load the pulled source cleanly (the volume
    //    persists it across the restart). Otherwise best-effort hot-reload and let
    //    the user restart. The DB commit is already recorded (step 7), so a restart
    //    boots straight into the new code.
    if (isAutoRestartEnabled()) {
      this.container.logger.info(
        `[DownloaderService] ${moduleName} updated on disk; restart required to apply.`,
      );
      return { updated: true, changelog, needsRestart: true };
    }

    this.container.logger.info(
      `[DownloaderService] Reloading module ${moduleName} (update)...`,
    );
    await this.container.moduleStore.reload(moduleName);
    this.container.logger.info(
      "[DownloaderService] Syncing commands (update)...",
    );
    await this.syncApplicationCommands();

    return { updated: true, changelog };
  }

  public async getInstalledModules() {
    return this.container.db.downloader.readAllInstalledDownloaderModules();
  }

  public async removeRepo(name: string) {
    const repo =
      await this.container.db.downloader.readDownloaderRepoWithModules(name);
    if (!repo) {
      throw new Error(`Repository **${name}** not found.`);
    }

    // Uninstall any modules that came from this repo
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

    // For newly hot-loaded commands the apiCalls array is empty because
    // CommandStore.loadAll() was already called at startup and won't re-run.
    // We call registerApplicationCommands on any command that hasn't been
    // registered yet (empty apiCalls), then bulk-overwrite Discord.
    // Sapphire's `apiCalls` array is an internal detail not exposed in public
    // types; we access it via a typed-unknown narrow to avoid littering `any`.
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

    // Collect global and guild-scoped command payloads from all registries
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
      // `ApplicationCommandManager.set` accepts `ApplicationCommandDataResolvable[]`;
      // our `object[]` payload matches the wire shape so the cast is sound.
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
