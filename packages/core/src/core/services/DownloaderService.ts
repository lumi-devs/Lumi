import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import { type Piece } from "@sapphire/framework";
import { resolver, ADDON_MODULES_ROOT, MODULE_ROOT } from "#core/lib/downloader/resolver.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errorFrom } from "#utilities/errors.js";

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
    this.container.logger.info(`[DownloaderService] Loading module ${moduleName}...`);
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
  ): Promise<{ updated: boolean; changelog?: string }> {
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

    // 1. Fetch from remote (ignore errors — offline or unreachable gracefully fails later)
    await execFileAsync("git", ["-C", repoPath, "fetch", "origin"]).catch(() => {});

    // 2. Get local hash and tracked remote branch
    const { stdout: localOut } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"]);
    const localHash = localOut.trim();

    const remoteRefResult = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "@{u}"]).catch(() => ({ stdout: "" }));
    const remoteRef = remoteRefResult.stdout.trim();

    const targetRef =
      remoteRef && !remoteRef.includes("@{u}")
        ? remoteRef
        : `origin/${branch === "default" ? "master" : branch}`;

    const { stdout: remoteOut } = await execFileAsync("git", ["-C", repoPath, "rev-parse", targetRef]);
    const remoteHash = remoteOut.trim();

    if (localHash === remoteHash) {
      return { updated: false };
    }

    // 3. Extract changelog (git log --oneline HEAD..remoteRef)
    const { stdout: logOut } = await execFileAsync("git", ["-C", repoPath, "log", "--oneline", `HEAD..${targetRef}`]).catch(() => ({ stdout: "" }));
    const changelog = logOut.trim();

    // 4. Perform pull
    const pullArgs = ["-C", repoPath, "pull"];
    if (branch !== "default") pullArgs.push("origin", branch);
    await execFileAsync("git", pullArgs).catch((err: NodeJS.ErrnoException & { stderr?: string }) => {
      throw new Error(`Git pull failed: ${(err.stderr ?? err.message).trim()}`);
    });

    // 5. Re-run resolver installation (isolated dependencies + symlinks)
    await resolver.installModule(repo.name, moduleName);

    // 6. Reload module in store with ESM cache-busting so updated source on disk takes effect
    this.container.logger.info(`[DownloaderService] Reloading module ${moduleName} (update)...`);
    await this.container.moduleStore.reload(moduleName);
    this.container.logger.info("[DownloaderService] Syncing commands (update)...");
    await this.syncApplicationCommands();


    // 7. Update database commit hash
    await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
      repo.id,
      moduleName,
      remoteHash,
    );

    return { updated: true, changelog };
  }

  public async getInstalledModules() {
    return this.container.db.downloader.readAllInstalledDownloaderModules();
  }

  public async removeRepo(name: string) {
    const repo = await this.container.db.downloader.readDownloaderRepoWithModules(name);
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
    type ApiCall = {
      registerOptions: { guildIds?: string[] };
      builtData: object;
    };
    type RegistryInternal = { apiCalls?: ApiCall[] };

    for (const command of commandStore.values()) {
      if (typeof command.registerApplicationCommands !== "function") continue;
      const registry = command.applicationCommandRegistry;
      const apiCalls = (registry as unknown as RegistryInternal).apiCalls;
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
        (command.applicationCommandRegistry as unknown as RegistryInternal).apiCalls ?? [];
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
