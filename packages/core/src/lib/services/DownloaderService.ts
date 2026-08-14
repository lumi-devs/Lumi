import { Service } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import { type Piece } from "@sapphire/framework";
import {
  resolver,
  ADDON_MODULES_ROOT,
  MODULE_ROOT,
} from "#lib/downloader/resolver.js";
import { pathExists } from "#lib/downloader/validate.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errorFrom } from "#lib/utilities/errors.js";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { withSerializedWork } from "#lib/utilities/misc.js";

export interface AutoUpdateConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt: number | null;
}

type ModuleUpdateCheck =
  | { ok: false; reason: string }
  | { ok: true; hasUpdate: false }
  | {
      ok: true;
      hasUpdate: true;
      repoId: number;
      repoName: string;
      branch: string;
      remoteHash: string;
      changelog: string;
    };

export type RepoUpdateCheck =
  | { ok: false; reason: string }
  | { ok: true; hasUpdate: false }
  | { ok: true; hasUpdate: true; changelog: string };

const execFileAsync = promisify(execFile);

/** One queued registration as Sapphire records it on a command's registry. */
interface ApiCall {
  registerOptions: { guildIds?: string[] };
  builtData: object;
}

/**
 * The private shape of Sapphire's `ApplicationCommandRegistry` that
 * {@linkcode DownloaderService.syncApplicationCommands} depends on.
 *
 * @remarks
 *
 * `apiCalls` is an undocumented, non-public field of Sapphire's
 * `ApplicationCommandRegistry`. It holds the normalized payloads produced by
 * `registerChatInputCommand` / `registerContextMenuCommand` together with the
 * guild scoping each registration asked for. Validated against
 * `@sapphire/framework@5.5.0`.
 *
 * There is no public alternative: the registry exposes only command *names* and
 * *ids* (`chatInputCommands`, `globalChatInputCommandIds`, ...), never the
 * built payloads, and the only public way to push them to Discord is
 * `ApplicationCommandRegistries.registerCommands`, which runs once during the
 * `ready` handshake and cannot be re-driven for a subset of pieces.
 *
 * If Sapphire renames or reshapes this field, live addon installs stop
 * publishing their slash commands until the process is restarted;
 * {@linkcode DownloaderService.syncApplicationCommands} degrades to a warning
 * rather than throwing.
 */
interface RegistryInternal {
  apiCalls?: ApiCall[];
}

/** Reads the registry's queued registrations, or `null` if the field is gone. */
function readApiCalls(registry: unknown): ApiCall[] | null {
  const { apiCalls } = (registry ?? {}) as RegistryInternal;
  return Array.isArray(apiCalls) ? apiCalls : null;
}

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
        const sourceExists = await pathExists(sourcePath);
        if (!sourceExists) {
          this.container.logger.info(
            `[DownloaderService] Restoring repo ${item.repo.name} for module ${item.moduleName}...`,
          );
          await resolver
            .addRepo(
              item.repo.name,
              item.repo.url,
              item.repo.branch || "default",
            )
            .catch(() => {});
        }

        const targetExists = await pathExists(targetPath);
        if (!targetExists && (await pathExists(sourcePath))) {
          await fs
            .rm(targetPath, { recursive: true, force: true })
            .catch(() => {});
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

  public async installModule(
    repoName: string,
    moduleName: string,
    revision?: string,
  ) {
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

    const info = revision
      ? await withSerializedWork(repoName, () =>
          resolver.installModule(repoName, moduleName, revision),
        )
      : await resolver.installModule(repoName, moduleName);
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
      if (info.commit) {
        await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
          repo.id,
          moduleName,
          info.commit,
        );
      }
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

  /** Read-only check: fetches and compares the repo's local HEAD against its remote branch, never pulls. */
  public async checkRepoUpdate(name: string): Promise<RepoUpdateCheck> {
    const repo = await this.container.db.downloader.readDownloaderRepo(name);
    if (!repo) {
      return { ok: false, reason: `Repository **${name}** was not found.` };
    }

    const repoPath = path.join(MODULE_ROOT, repo.name);
    try {
      await fs.access(repoPath);
    } catch {
      return { ok: true, hasUpdate: true, changelog: "" };
    }

    await execFileAsync("git", ["-C", repoPath, "fetch", "origin"]).catch(
      (err: NodeJS.ErrnoException & { stderr?: string }) => {
        this.container.logger.warn(
          `[DownloaderService] git fetch failed for ${repo.name}; update check uses stale refs: ${(err.stderr ?? err.message).trim()}`,
        );
      },
    );

    const branch = repo.branch || "default";
    const targetRef = `origin/${branch === "default" ? "master" : branch}`;

    try {
      const localHash = (
        await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"])
      ).stdout.trim();
      const remoteHash = (
        await execFileAsync("git", ["-C", repoPath, "rev-parse", targetRef])
      ).stdout.trim();

      if (localHash === remoteHash) {
        return { ok: true, hasUpdate: false };
      }

      const { stdout: logOut } = await execFileAsync("git", [
        "-C",
        repoPath,
        "log",
        "--oneline",
        `HEAD..${targetRef}`,
      ]).catch(() => ({ stdout: "" }));

      return { ok: true, hasUpdate: true, changelog: logOut.trim() };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `Could not check **${name}** for updates: ${msg}` };
    }
  }

  public listRepos() {
    return this.container.db.downloader.readAllDownloaderRepos();
  }

  public getModulesInRepo(repoName: string) {
    return resolver.getModulesInRepo(repoName);
  }

  public async getRepoStatus(
    repoName: string,
  ): Promise<{ lastCommit: string | null; lastCommitTime: string | null }> {
    const repoPath = path.join(MODULE_ROOT, repoName);
    try {
      const { stdout } = await execFileAsync("git", [
        "-C",
        repoPath,
        "log",
        "-1",
        "--format=%h|%cr",
      ]);
      const [hash, time] = stdout.trim().split("|");
      return { lastCommit: hash || null, lastCommitTime: time || null };
    } catch {
      return { lastCommit: null, lastCommitTime: null };
    }
  }

  /** Read-only check: fetches and compares hashes, never pulls. Shared by updateModule() and checkForUpdates(). */
  private async checkForModuleUpdate(
    moduleName: string,
  ): Promise<ModuleUpdateCheck> {
    const installed =
      await this.container.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      return {
        ok: false,
        reason: `Module **${moduleName}** was not installed via the downloader.`,
      };
    }

    const repo = await this.container.db.downloader.readDownloaderRepoById(
      installed.repoId,
    );
    if (!repo) {
      return {
        ok: false,
        reason: `Repository for module **${moduleName}** could not be found.`,
      };
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
      return { ok: true, hasUpdate: false };
    }

    if (fetchFailed && localHash === remoteHash) {
      await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
        repo.id,
        moduleName,
        remoteHash,
      );
      return { ok: true, hasUpdate: false };
    }

    const { stdout: logOut } = await execFileAsync("git", [
      "-C",
      repoPath,
      "log",
      "--oneline",
      `HEAD..${targetRef}`,
    ]).catch(() => ({ stdout: "" }));

    return {
      ok: true,
      hasUpdate: true,
      repoId: repo.id,
      repoName: repo.name,
      branch,
      remoteHash,
      changelog: logOut.trim(),
    };
  }

  public async updateModule(
    moduleName: string,
    revision?: string,
  ): Promise<{
    updated: boolean;
    changelog?: string;
    needsRestart?: boolean;
    pinned?: boolean;
  }> {
    const installed =
      await this.container.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }
    if (installed.pinned && !revision) {
      return { updated: false, pinned: true };
    }

    const repo = await this.container.db.downloader.readDownloaderRepoById(
      installed.repoId,
    );
    if (!repo) {
      throw new Error(
        `Repository for module **${moduleName}** could not be found.`,
      );
    }

    if (revision) {
      const repoPath = path.join(MODULE_ROOT, repo.name);
      const info = await withSerializedWork(repo.name, () =>
        resolver.installModule(repo.name, moduleName, revision),
      );

      await this.container.moduleStore.discover(true);
      await this.container.moduleStore.loadModule(moduleName);
      await this.syncApplicationCommands();

      if (info.commit) {
        await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
          repo.id,
          moduleName,
          info.commit,
        );
      }

      this.container.logger.info(
        `[DownloaderService] ${moduleName} checked out to ${revision} (${info.commit ?? "unknown"}) at ${repoPath}.`,
      );
      return { updated: true, needsRestart: true };
    }

    const check = await this.checkForModuleUpdate(moduleName);
    if (!check.ok) throw new Error(check.reason);
    if (!check.hasUpdate) return { updated: false };

    const { repoId, repoName, branch, remoteHash, changelog } = check;
    const repoPath = path.join(MODULE_ROOT, repoName);

    await withSerializedWork(repoName, async () => {
      const pullArgs = ["-C", repoPath, "pull"];
      if (branch !== "default") pullArgs.push("origin", branch);
      await execFileAsync("git", pullArgs).catch(
        (err: NodeJS.ErrnoException & { stderr?: string }) => {
          throw new Error(
            `Git pull failed: ${(err.stderr ?? err.message).trim()}`,
          );
        },
      );

      await resolver.installModule(repoName, moduleName);
    });

    await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
      repoId,
      moduleName,
      remoteHash,
    );

    this.container.logger.info(
      `[DownloaderService] ${moduleName} updated on disk; restart required to apply.`,
    );
    return { updated: true, changelog, needsRestart: true };
  }

  /**
   * Checks out an already-installed module to a specific prior revision
   * against its existing clone - no re-clone, just a checkout + manifest
   * refresh, mirroring the tail end of {@linkcode updateModule}.
   */
  public async rollbackModule(
    moduleName: string,
    revision: string,
  ): Promise<{ commit: string | null; needsRestart: true }> {
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

    const info = await withSerializedWork(repo.name, () =>
      resolver.installModule(repo.name, moduleName, revision),
    );

    await this.container.moduleStore.discover(true);
    await this.container.moduleStore.loadModule(moduleName);
    await this.syncApplicationCommands();

    if (info.commit) {
      await this.container.db.downloader.updateInstalledDownloaderModuleCommit(
        repo.id,
        moduleName,
        info.commit,
      );
    }

    this.container.logger.info(
      `[DownloaderService] Rolled back ${moduleName} to ${revision} (${info.commit ?? "unknown"}).`,
    );
    return { commit: info.commit, needsRestart: true };
  }

  /** Read-only sweep across every installed module; Redis-cached to avoid hammering git on repeated calls. */
  public async checkForUpdates(): Promise<string[]> {
    const cacheKey = RedisKeys.addonUpdateCheck();
    const cached = await this.container.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as string[];
      } catch {
        this.container.logger.warn(
          `[DownloaderService] Discarding corrupted update-check cache at ${cacheKey}.`,
        );
      }
    }

    const installed = await this.getInstalledModules();
    const pending: string[] = [];
    for (const mod of installed) {
      try {
        const check = await this.checkForModuleUpdate(mod.moduleName);
        if (check.ok && check.hasUpdate) pending.push(mod.moduleName);
      } catch (err: unknown) {
        this.container.logger.warn(
          `[DownloaderService] Update check failed for ${mod.moduleName}: ${String(err)}`,
        );
      }
    }

    await this.container.redis.setex(
      cacheKey,
      RedisTTL.addonUpdateCheck,
      JSON.stringify(pending),
    );
    return pending;
  }

  public async getAutoUpdateConfig(): Promise<AutoUpdateConfig> {
    const global = await this.container.db.global.getGlobalConfig();
    const extra = (global.extra as Record<string, unknown> | null) ?? {};
    const raw = extra.autoUpdate as Partial<AutoUpdateConfig> | undefined;
    return {
      enabled: raw?.enabled ?? false,
      intervalMinutes: raw?.intervalMinutes ?? 360,
      lastCheckedAt: raw?.lastCheckedAt ?? null,
    };
  }

  public async setAutoUpdateConfig(
    patch: Partial<AutoUpdateConfig>,
  ): Promise<void> {
    const global = await this.container.db.global.getGlobalConfig();
    const extra = (global.extra as Record<string, unknown> | null) ?? {};
    const current = (extra.autoUpdate as Partial<AutoUpdateConfig>) ?? {};
    await this.container.db.global.updateGlobalConfig({
      extra: { ...extra, autoUpdate: { ...current, ...patch } },
    });
  }

  /** Freezes (or unfreezes) an installed module against `,module update`/`updateall`. */
  public async setModulePinned(
    moduleName: string,
    pinned: boolean,
  ): Promise<void> {
    const installed =
      await this.container.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }
    await this.container.db.downloader.setInstalledDownloaderModulePinned(
      moduleName,
      pinned,
    );
  }

  public getInstalledModules() {
    return this.container.db.downloader.readAllInstalledDownloaderModules();
  }

  public getInstalledModulesDetailed() {
    return this.container.db.downloader.readAllInstalledDownloaderModulesWithRepo();
  }

  /** Enables/disables an installed addon module live via ModuleStore - no restart. */
  public async toggleModule(
    moduleName: string,
    enabled: boolean,
  ): Promise<void> {
    const installed =
      await this.container.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }
    await this.container.moduleStore.setEnabled(
      moduleName,
      enabled,
      "toggled via addons panel",
    );
    await this.syncApplicationCommands();
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

  /**
   * Re-publishes every loaded command's application-command payloads so a
   * module installed or toggled at runtime appears in Discord without a
   * restart.
   *
   * @remarks
   *
   * Sapphire only drives its own registration pass once, during the `ready`
   * handshake, so this reads each piece's queued payloads straight off the
   * private `apiCalls` field of its `ApplicationCommandRegistry` - see
   * {@linkcode RegistryInternal} for why no public API can supply them - and
   * bulk-overwrites the global and per-guild command sets from what it finds.
   *
   * Pieces that were loaded after the handshake have an empty queue, so their
   * `registerApplicationCommands` is invoked first to fill it. When the private
   * field is absent on every registry the sync is skipped with a warning
   * instead of silently wiping the application's commands.
   */
  public async syncApplicationCommands() {
    const { client } = this.container;
    if (!client.application) {
      this.container.logger.warn(
        "[DownloaderService] client.application not ready; slash command sync skipped",
      );
      return;
    }

    const commandStore = this.container.stores.get("commands");

    for (const command of commandStore.values()) {
      if (typeof command.registerApplicationCommands !== "function") continue;
      const registry = command.applicationCommandRegistry;
      if (!readApiCalls(registry)?.length) {
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
    let registriesRead = 0;

    for (const command of commandStore.values()) {
      const apiCalls = readApiCalls(command.applicationCommandRegistry);
      if (apiCalls === null) continue;
      registriesRead += 1;
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

    if (registriesRead === 0 && commandStore.size > 0) {
      this.container.logger.warn(
        "[DownloaderService] ApplicationCommandRegistry no longer exposes `apiCalls`; slash command sync skipped",
      );
      return;
    }

    if (globalData.length) {
      try {
        await client.application.commands.set(
          globalData as Parameters<typeof client.application.commands.set>[0],
        );
        this.container.logger.info(
          `[DownloaderService] Synced ${globalData.length} global application commands.`,
        );
      } catch (err: unknown) {
        this.container.logger.error(
          `[DownloaderService] Failed to sync global application commands: ${String(err)}`,
        );
      }
    }
    for (const [guildId, data] of guildData) {
      try {
        await client.application.commands.set(
          data as Parameters<typeof client.application.commands.set>[0],
          guildId,
        );
        this.container.logger.info(
          `[DownloaderService] Synced ${data.length} commands for guild ${guildId}.`,
        );
      } catch (err: unknown) {
        this.container.logger.error(
          `[DownloaderService] Failed to sync commands for guild ${guildId}: ${String(err)}`,
        );
      }
    }
  }
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    downloader: DownloaderService;
  }
}
