import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import { type Piece } from "@sapphire/framework";
import { resolver } from "#core/lib/downloader/resolver.js";
import { promises as fs } from "node:fs";
import path from "node:path";

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

    await resolver.installModule(repoName, moduleName);
    await this.container.db.downloader.writeInstalledDownloaderModule(
      repo.id,
      moduleName,
    );

    await this.container.moduleStore.discover(true);
    await this.container.moduleStore.loadModule(moduleName);
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

    await this.container.moduleStore.unload(moduleName);

    const targetPath = path.join(
      process.cwd(),
      "packages",
      "core",
      "src",
      "modules",
      moduleName,
    );
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch (err: unknown) {
      this.container.logger.error(
        `[DownloaderService] failed to remove files:`,
        err,
      );
    }

    await this.container.db.downloader.deleteInstalledDownloaderModule(
      moduleName,
    );
  }

  public async addRepo(name: string, url: string, branch: string) {
    await resolver.addRepo(name, url, branch);
    await this.container.db.downloader.writeDownloaderRepo(name, url, branch);
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

    const repoPath = path.join(
      process.cwd(),
      "data",
      "3rd-party-modules",
      repo.name,
    );
    const branch = repo.branch || "default";

    // 1. Fetch from remote
    const fetchProc = Bun.spawn(["git", "-C", repoPath, "fetch", "origin"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await fetchProc.exited;

    // 2. Get local hash and tracked remote branch
    const getLocal = Bun.spawn(["git", "-C", repoPath, "rev-parse", "HEAD"], {
      stdout: "pipe",
    });
    const localHash = (await new Response(getLocal.stdout).text()).trim();

    const getRemoteRef = Bun.spawn(
      ["git", "-C", repoPath, "rev-parse", "--abbrev-ref", "@{u}"],
      { stdout: "pipe" },
    );
    const remoteRef = (await new Response(getRemoteRef.stdout).text()).trim();

    const targetRef =
      remoteRef && !remoteRef.includes("@{u}")
        ? remoteRef
        : `origin/${branch === "default" ? "master" : branch}`;

    const getRemoteHash = Bun.spawn(
      ["git", "-C", repoPath, "rev-parse", targetRef],
      { stdout: "pipe" },
    );
    const remoteHash = (await new Response(getRemoteHash.stdout).text()).trim();

    if (localHash === remoteHash) {
      return { updated: false };
    }

    // 3. Extract changelog (git log --oneline HEAD..remoteRef)
    const getLog = Bun.spawn(
      ["git", "-C", repoPath, "log", "--oneline", `HEAD..${targetRef}`],
      { stdout: "pipe" },
    );
    const changelog = (await new Response(getLog.stdout).text()).trim();

    // 4. Perform pull
    const pullArgs = ["git", "-C", repoPath, "pull"];
    if (branch !== "default") {
      pullArgs.push("origin", branch);
    }
    const pullProc = Bun.spawn(pullArgs, { stdout: "pipe", stderr: "pipe" });
    const pullCode = await pullProc.exited;
    if (pullCode !== 0) {
      throw new Error(`Git pull failed with exit code ${pullCode}`);
    }

    // 5. Re-run resolver installation (isolated dependencies + symlinks)
    await resolver.installModule(repo.name, moduleName);

    // 6. Reload module in store
    await this.container.moduleStore.unload(moduleName);
    await this.container.moduleStore.discover(true);
    await this.container.moduleStore.loadModule(moduleName);

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
}
