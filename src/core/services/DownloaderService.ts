import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { resolver } from "#core/lib/downloader/resolver.js";
import { promises as fs } from "node:fs";
import path from "node:path";

@ApplyOptions<Piece.Options>({ name: "downloader" })
export class DownloaderService extends Service {
  public async installModule(repoName: string, moduleName: string) {
    const repo = await this.container.db.readDownloaderRepo(repoName);
    if (!repo) {
      throw new Error(
        `Repository **${repoName}** has not been added. Use \`/repo add\` first.`,
      );
    }

    await resolver.installModule(repoName, moduleName);
    await this.container.db.writeInstalledDownloaderModule(repo.id, moduleName);

    await this.container.moduleStore.discover(true);
    await this.container.moduleStore.loadModule(moduleName);
  }

  public async uninstallModule(moduleName: string) {
    const installedCheck =
      await this.container.db.readInstalledDownloaderModule(moduleName);
    if (!installedCheck) {
      throw new Error(
        `Module **${moduleName}** was not installed via the downloader.`,
      );
    }

    await this.container.moduleStore.unload(moduleName);

    const targetPath = path.join(process.cwd(), "src", "modules", moduleName);
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch (err: unknown) {
      this.container.logger.error(
        `[DownloaderService] failed to remove files:`,
        err,
      );
    }

    await this.container.db.deleteInstalledDownloaderModule(moduleName);
  }

  public async addRepo(name: string, url: string, branch: string) {
    await resolver.addRepo(name, url, branch);
    await this.container.db.writeDownloaderRepo(name, url, branch);
  }

  public async listRepos() {
    return this.container.db.readAllDownloaderRepos();
  }

  public async getModulesInRepo(repoName: string) {
    return resolver.getModulesInRepo(repoName);
  }
}
