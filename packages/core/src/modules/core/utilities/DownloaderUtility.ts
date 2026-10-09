import { defineUtility } from "#lib/module-system/Utility.js";
import { container, type Container } from "#lib/services.js";
import {
  resolver,
  AddonModulesRoot,
  ModuleRoot,
  PinRoot,
  RepoAlreadyInstalledError,
  type RepoUpdateResult,
} from "#lib/downloader/resolver.js";
import { pathExists } from "#lib/downloader/validate.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { errorFrom } from "#lib/utilities/errors.js";
import { ValkeyKeys, ValkeyTTL } from "#lib/valkey/client.js";
import { withSerializedWork } from "#lib/utilities/misc.js";
import { execFileAsync } from "#lib/utilities/exec-file.js";
import { commandRegistry } from "#lib/commands/command-def.js";

export interface AutoUpdateConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt: Date | null;
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

export class ModuleAlreadyInstalledError extends Error {
  public readonly moduleName: string;
  public constructor(moduleName: string) {
    super(`Module **${moduleName}** is already installed.`);
    this.moduleName = moduleName;
    this.name = "ModuleAlreadyInstalledError";
  }
}

async function syncInstalledModulesOnStartup(services: Container) {
  await fs.mkdir(AddonModulesRoot, { recursive: true });
  const installed =
    await services.db.downloader.readAllInstalledDownloaderModulesWithRepo();
  if (!installed.length) return;

  let restoredAny = false;
  for (const item of installed) {
    const sourcePath = path.join(
      ModuleRoot,
      item.repo.name,
      item.moduleName,
    );
    const targetPath = path.join(AddonModulesRoot, item.moduleName);

    try {
      const sourceExists = await pathExists(sourcePath);
      if (!sourceExists) {
        services.logger.info(
          `[DownloaderUtility] Restoring repo ${item.repo.name} for module ${item.moduleName}...`,
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
        services.logger.info(
          `[DownloaderUtility] Restored addon symlink for ${item.moduleName}`,
        );
      }
    } catch (err) {
      services.logger.warn(
        `[DownloaderUtility] Failed to restore symlink for ${item.moduleName}:`,
        err,
      );
    }
  }

  if (restoredAny) {
    await services.moduleStore.discover(true);
  }
}

async function uninstallModule(services: Container, moduleName: string) {
  const installedCheck =
    await services.db.downloader.readInstalledDownloaderModule(
      moduleName,
    );
  if (!installedCheck) {
    throw new Error(
      `Module **${moduleName}** was not installed via the downloader.`,
    );
  }

  try {
    await services.moduleStore.unload(moduleName);
  } catch (err: unknown) {
    const msg = errorFrom(err).message;
    if (!msg.includes("does not exist")) {
      throw err;
    }
  }

  const targetPath = path.join(AddonModulesRoot, moduleName);
  const previousLink = await fs.readlink(targetPath).catch(() => null);
  const previousSourcePath =
    previousLink !== null
      ? path.resolve(path.dirname(targetPath), previousLink)
      : null;

  await fs.rm(targetPath, { recursive: true, force: true }).catch((err) => {
    services.logger.error(
      `[DownloaderUtility] failed to remove symlink/directory at ${targetPath}:`,
      err,
    );
  });

  await services.db.downloader.deleteInstalledDownloaderModule(
    installedCheck.repoId,
    moduleName,
  );

  await resolver
    .releasePinnedWorktreeIfUnused(previousSourcePath)
    .catch((err: unknown) => {
      services.logger.warn(
        `[DownloaderUtility] Failed to release pinned worktree for ${moduleName}:`,
        err,
      );
    });

  await bustUpdateCheckCache(services);
}

async function addRepo(
  services: Container,
  name: string,
  url: string,
  branch: string,
): Promise<{ sha: string | null; signatureWarning: string | null }> {
  let sha: string | null;
  let signedBy: string | null;
  let signatureWarning: string | null;
  try {
    ({ sha, signedBy, signatureWarning } = await resolver.addRepo(name, url, branch));
  } catch (err: unknown) {
    if (err instanceof RepoAlreadyInstalledError) {
      throw new Error(
        `Repository **${name}** is already installed${err.sha ? ` at commit \`${err.sha}\`` : ""}. Use \`,repo update ${name}\` to pull and validate the latest changes.`,
      );
    }
    throw err;
  }
  await services.db.downloader.writeDownloaderRepo(name, url, branch, sha, signedBy);
  return { sha, signatureWarning };
}

async function bustUpdateCheckCache(services: Container): Promise<void> {
  await services.valkey?.del?.(ValkeyKeys.addonUpdateCheck())?.catch?.(() => undefined);
}

/** Single fetch + hash resolution behind every update check, so the hub badge,
 * the explicit check button and updateModule() all compare the same numbers. */
async function fetchRepoHashes(
  services: Container,
  repoName: string,
  repoPath: string,
  branch: string,
): Promise<{ localHash: string; remoteHash: string; targetRef: string; fetchFailed: boolean }> {
  const fetchFailed = await execFileAsync("git", [
    "-C",
    repoPath,
    "fetch",
    "origin",
  ])
    .then(() => false)
    .catch((err: NodeJS.ErrnoException & { stderr?: string }) => {
      services.logger.warn(
        `[DownloaderUtility] git fetch failed for ${repoName}; update check uses stale refs: ${(err.stderr ?? err.message).trim()}`,
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
  return { localHash, remoteHash: remoteOut.trim(), targetRef, fetchFailed };
}

/** Read-only check: fetches and compares hashes, never pulls. Shared by updateModule() and checkForUpdates(). */
async function checkForModuleUpdate(
  services: Container,
  moduleName: string,
): Promise<ModuleUpdateCheck> {
  const installed =
    await services.db.downloader.readInstalledDownloaderModule(
      moduleName,
    );
  if (!installed) {
    return {
      ok: false,
      reason: `Module **${moduleName}** was not installed via the downloader.`,
    };
  }

  const repo = await services.db.downloader.readDownloaderRepoById(
    installed.repoId,
  );
  if (!repo) {
    return {
      ok: false,
      reason: `Repository for module **${moduleName}** could not be found.`,
    };
  }

  const repoPath = path.join(ModuleRoot, repo.name);
  const branch = repo.branch || "default";

  try {
    await fs.access(repoPath);
  } catch {
    // Directory is missing entirely, not just stale - this is a repair
    // clone, not a pull of new upstream commits, so it goes through
    // addRepo() rather than updateRepo().
    await addRepo(services, repo.name, repo.url, branch);
  }

  const { localHash, remoteHash, targetRef, fetchFailed } =
    await fetchRepoHashes(services, repo.name, repoPath, branch);

  const linkTarget =
    typeof fs.realpath === "function"
      ? await fs.realpath(path.join(AddonModulesRoot, moduleName)).catch(() => null)
      : null;
  const pinned =
    Boolean(
      linkTarget &&
        (linkTarget === PinRoot || linkTarget.startsWith(PinRoot + path.sep)),
    );

  const installedHash = installed.commit ?? null;
  const servedHash = pinned ? installedHash : localHash;
  if (servedHash !== null && servedHash === remoteHash) {
    if (!pinned && installedHash !== remoteHash) {
      await services.db.downloader.updateInstalledDownloaderModuleCommit(
        repo.id,
        moduleName,
        remoteHash,
      );
    }
    return { ok: true, hasUpdate: false };
  }

  if (fetchFailed && localHash === remoteHash) {
    await services.db.downloader.updateInstalledDownloaderModuleCommit(
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

function getInstalledModules(services: Container) {
  return services.db.downloader.readAllInstalledDownloaderModules();
}

async function syncApplicationCommands(services: Container) {
  const { client } = services;
  if (!client.application) {
    services.logger.warn(
      "[DownloaderUtility] client.application not ready; slash command sync skipped",
    );
    return;
  }

  const seen = new Set<string>();
  const globalData: object[] = [];

  for (const def of commandRegistry.values()) {
    if (seen.has(def.name)) continue;
    seen.add(def.name);
    try {
      const built = def.build?.() as
        | { toJSON?: unknown }
        | Record<string, unknown>
        | null
        | undefined;
      if (built) {
        globalData.push(
          typeof built.toJSON === "function"
            ? (built.toJSON as () => object)()
            : built,
        );
      }
      const menu = def.contextMenu?.build();
      if (menu) globalData.push(menu.toJSON());
    } catch (err: unknown) {
      services.logger.error(
        `[DownloaderUtility] build failed for ${def.name}:`,
        err,
      );
    }
  }

  if (globalData.length === 0) {
    services.logger.warn(
      "[DownloaderUtility] No command payloads to sync; slash command sync skipped",
    );
    return;
  }

  if (globalData.length) {
    try {
      await client.application.commands.set(
        globalData as Parameters<typeof client.application.commands.set>[0],
      );
      services.logger.info(
        `[DownloaderUtility] Synced ${globalData.length} global application commands.`,
      );
    } catch (err: unknown) {
      services.logger.error(
        `[DownloaderUtility] Failed to sync global application commands: ${String(err)}`,
      );
    }
  }
}

export const downloaderUtility = defineUtility({
  name: "downloader",

  syncInstalledModulesOnStartup,
  uninstallModule,
  addRepo,
  getInstalledModules,
  syncApplicationCommands,

  async onLoad(services: Container = container) {
    await downloaderUtility.syncInstalledModulesOnStartup(services).catch((err) => {
      services.logger.error(
        "[DownloaderUtility] Failed to sync installed modules on startup:",
        err,
      );
    });
  },

  async installModule(
    services: Container,
    repoName: string,
    moduleName: string,
    revision?: string,
  ): Promise<{ signatureWarning: string | null }> {
    const repo =
      await services.db.downloader.readDownloaderRepo(repoName);
    if (!repo) {
      throw new Error(
        `Repository **${repoName}** has not been added. Use \`,repo add\` first.`,
      );
    }

    const existing =
      await services.db.downloader.readInstalledDownloaderModule(
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
      services.logger.info("[DownloaderUtility] Discovering modules...");
      await services.moduleStore.discover(true);
      services.logger.info(
        `[DownloaderUtility] Loading module ${moduleName}...`,
      );
      await services.moduleStore.loadModule(moduleName, true);
      services.logger.info("[DownloaderUtility] Syncing commands...");
      await downloaderUtility.syncApplicationCommands(services);
      await services.db.downloader.writeInstalledDownloaderModule(
        repo.id,
        moduleName,
        info.version,
        info.signedBy,
      );
      if (info.commit) {
        await services.db.downloader.updateInstalledDownloaderModuleCommit(
          repo.id,
          moduleName,
          info.commit,
          info.signedBy,
        );
      }
      await bustUpdateCheckCache(services);
    } catch (err: unknown) {
      await services.moduleStore
        .unload(moduleName)
        .catch(() => undefined);
      await fs
        .unlink(path.join(AddonModulesRoot, moduleName))
        .catch(() => undefined);
      throw err;
    }

    return { signatureWarning: info.signatureWarning };
  },

  async updateRepo(services: Container, name: string): Promise<RepoUpdateResult> {
    const repo = await services.db.downloader.readDownloaderRepo(name);
    if (!repo) {
      throw new Error(
        `Repository **${name}** not found. Add it first using \`,repo add\`.`,
      );
    }
    const result = await resolver.updateRepo(repo.name, repo.url, repo.branch);
    await services.db.downloader.updateDownloaderRepoCommit(
      repo.id,
      result.newSha,
      result.signedBy,
    );
    return result;
  },

  /** Read-only check: fetches and compares the repo's local HEAD against its remote branch, never pulls. */
  async checkRepoUpdate(services: Container, name: string): Promise<RepoUpdateCheck> {
    const repo = await services.db.downloader.readDownloaderRepo(name);
    if (!repo) {
      return { ok: false, reason: `Repository **${name}** was not found.` };
    }

    const repoPath = path.join(ModuleRoot, repo.name);
    try {
      await fs.access(repoPath);
    } catch {
      return { ok: true, hasUpdate: true, changelog: "" };
    }

    const branch = repo.branch || "default";

    try {
      const { localHash, remoteHash, targetRef } = await fetchRepoHashes(
        services,
        repo.name,
        repoPath,
        branch,
      );

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
  },

  listRepos(services: Container) {
    return services.db.downloader.readAllDownloaderRepos();
  },

  getModulesInRepo(repoName: string) {
    return resolver.getModulesInRepo(repoName);
  },

  async getRepoStatus(
    repoName: string,
  ): Promise<{ lastCommit: string | null; lastCommitTime: string | null }> {
    const repoPath = path.join(ModuleRoot, repoName);
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
  },

  async updateModule(
    services: Container,
    moduleName: string,
    revision?: string,
  ): Promise<{
    updated: boolean;
    changelog?: string;
    needsRestart?: boolean;
    pinned?: boolean;
    signatureWarning?: string | null;
  }> {
    const installed =
      await services.db.downloader.readInstalledDownloaderModule(
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

    const repo = await services.db.downloader.readDownloaderRepoById(
      installed.repoId,
    );
    if (!repo) {
      throw new Error(
        `Repository for module **${moduleName}** could not be found.`,
      );
    }

    if (revision) {
      const repoPath = path.join(ModuleRoot, repo.name);
      const info = await withSerializedWork(repo.name, () =>
        resolver.installModule(repo.name, moduleName, revision),
      );

      await services.moduleStore.discover(true);
      await services.moduleStore.loadModule(moduleName, true);
      await downloaderUtility.syncApplicationCommands(services);

      if (info.commit) {
        await services.db.downloader.updateInstalledDownloaderModuleCommit(
          repo.id,
          moduleName,
          info.commit,
          info.signedBy,
        );
      }

      services.logger.info(
        `[DownloaderUtility] ${moduleName} checked out to ${revision} (${info.commit ?? "unknown"}) at ${repoPath}.`,
      );
      return { updated: true, needsRestart: true, signatureWarning: info.signatureWarning };
    }

    const check = await checkForModuleUpdate(services, moduleName);
    if (!check.ok) throw new Error(check.reason);
    if (!check.hasUpdate) return { updated: false };

    const { repoId, repoName, branch, remoteHash, changelog } = check;
    const repoPath = path.join(ModuleRoot, repoName);

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

    await services.db.downloader.updateInstalledDownloaderModuleCommit(
      repoId,
      moduleName,
      remoteHash,
    );

    services.logger.info(
      `[DownloaderUtility] ${moduleName} updated on disk; restart required to apply.`,
    );
    return { updated: true, changelog, needsRestart: true };
  },

  /**
   * Checks out an already-installed module to a specific prior revision
   * against its existing clone - no re-clone, just a checkout + manifest
   * refresh, mirroring the tail end of {@linkcode updateModule}.
   */
  async rollbackModule(
    services: Container,
    moduleName: string,
    revision: string,
  ): Promise<{ commit: string | null; needsRestart: true; signatureWarning: string | null }> {
    const installed =
      await services.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }

    const repo = await services.db.downloader.readDownloaderRepoById(
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

    await services.moduleStore.discover(true);
    await services.moduleStore.loadModule(moduleName, true);
    await downloaderUtility.syncApplicationCommands(services);

    if (info.commit) {
      await services.db.downloader.updateInstalledDownloaderModuleCommit(
        repo.id,
        moduleName,
        info.commit,
        info.signedBy,
      );
    }

    services.logger.info(
      `[DownloaderUtility] Rolled back ${moduleName} to ${revision} (${info.commit ?? "unknown"}).`,
    );
    return { commit: info.commit, needsRestart: true, signatureWarning: info.signatureWarning };
  },

  /** Read-only sweep across every installed module; Valkey-cached to avoid hammering git on repeated calls. */
  async checkForUpdates(services: Container): Promise<string[]> {
    const cacheKey = ValkeyKeys.addonUpdateCheck();
    const cached = await services.valkey.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as string[];
      } catch {
        services.logger.warn(
          `[DownloaderUtility] Discarding corrupted update-check cache at ${cacheKey}.`,
        );
      }
    }

    const installed = await getInstalledModules(services);
    const pending: string[] = [];
    for (const mod of installed) {
      try {
        const check = await checkForModuleUpdate(services, mod.moduleName);
        if (check.ok && check.hasUpdate) pending.push(mod.moduleName);
      } catch (err: unknown) {
        services.logger.warn(
          `[DownloaderUtility] Update check failed for ${mod.moduleName}: ${String(err)}`,
        );
      }
    }

    await services.valkey.setex(
      cacheKey,
      ValkeyTTL.addonUpdateCheck,
      JSON.stringify(pending),
    );
    return pending;
  },

  async getAutoUpdateConfig(services: Container): Promise<AutoUpdateConfig> {
    const global = await services.db.global.getGlobalConfig();
    return {
      enabled: global.autoUpdateEnabled,
      intervalMinutes: global.autoUpdateIntervalMinutes,
      lastCheckedAt: global.autoUpdateLastCheckedAt,
    };
  },

  async setAutoUpdateConfig(
    services: Container,
    patch: Partial<AutoUpdateConfig>,
  ): Promise<void> {
    await services.db.global.updateGlobalConfig({
      ...(patch.enabled !== undefined && { autoUpdateEnabled: patch.enabled }),
      ...(patch.intervalMinutes !== undefined && {
        autoUpdateIntervalMinutes: patch.intervalMinutes,
      }),
      ...(patch.lastCheckedAt !== undefined && {
        autoUpdateLastCheckedAt: patch.lastCheckedAt,
      }),
    });
  },

  /** Freezes (or unfreezes) an installed module against `,module update`/`updateall`. */
  async setModulePinned(
    services: Container,
    moduleName: string,
    pinned: boolean,
  ): Promise<void> {
    const installed =
      await services.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }
    await services.db.downloader.setInstalledDownloaderModulePinned(
      installed.repoId,
      moduleName,
      pinned,
    );
  },

  getInstalledModulesDetailed(services: Container) {
    return services.db.downloader.readAllInstalledDownloaderModulesWithRepo();
  },

  /** Enables/disables an installed addon module live via ModuleStore - no restart. */
  async toggleModule(
    services: Container,
    moduleName: string,
    enabled: boolean,
  ): Promise<void> {
    const installed =
      await services.db.downloader.readInstalledDownloaderModule(
        moduleName,
      );
    if (!installed) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }
    await services.moduleStore.setEnabled(
      moduleName,
      enabled,
      "toggled via addons panel",
    );
    await downloaderUtility.syncApplicationCommands(services);
  },

  async removeRepo(services: Container, name: string) {
    const repo =
      await services.db.downloader.readDownloaderRepoWithModules(name);
    if (!repo) {
      throw new Error(`Repository **${name}** not found.`);
    }

    for (const mod of repo.installedModules) {
      try {
        await uninstallModule(services, mod.moduleName);
      } catch (err: unknown) {
        services.logger.warn(
          `[DownloaderUtility] Failed to uninstall ${mod.moduleName} during repo removal:`,
          err,
        );
      }
    }

    await services.db.downloader.deleteDownloaderRepo(name);
  }
});

export type DownloaderUtility = typeof downloaderUtility;

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    downloader: typeof downloaderUtility;
  }
}
