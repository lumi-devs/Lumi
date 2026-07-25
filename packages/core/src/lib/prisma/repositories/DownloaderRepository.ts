import { Repository } from "#lib/prisma/repositories/Repository.js";

/**
 * Module downloader bookkeeping — `DownloaderRepo` (tracked git repos) and
 * `DownloaderModule` (installed modules per repo).  No Redis caching.
 */
export class DownloaderRepository extends Repository {
  public readDownloaderRepo(name: string) {
    return this.prisma.downloaderRepo.findUnique({ where: { name } });
  }

  public readDownloaderRepoWithModules(name: string) {
    return this.prisma.downloaderRepo.findUnique({
      where: { name },
      include: { installedModules: true },
    });
  }

  public readAllDownloaderRepos() {
    return this.prisma.downloaderRepo.findMany();
  }

  public writeDownloaderRepo(name: string, url: string, branch: string) {
    return this.prisma.downloaderRepo.upsert({
      where: { name },
      update: { url, branch },
      create: { name, url, branch },
    });
  }

  public deleteDownloaderRepo(name: string) {
    return this.prisma.downloaderRepo.delete({ where: { name } });
  }

  public readInstalledDownloaderModule(moduleName: string, repoId?: number) {
    return this.prisma.downloaderModule.findFirst({
      where: repoId ? { repoId, moduleName } : { moduleName },
    });
  }

  public writeInstalledDownloaderModule(
    repoId: number,
    moduleName: string,
    version?: string,
  ) {
    return this.prisma.downloaderModule.upsert({
      where: { repoId_moduleName: { repoId, moduleName } },
      update: { installedAt: new Date(), ...(version ? { version } : {}) },
      create: { repoId, moduleName, version },
    });
  }

  public deleteInstalledDownloaderModule(moduleName: string) {
    return this.prisma.downloaderModule.deleteMany({ where: { moduleName } });
  }

  public readAllInstalledDownloaderModules() {
    return this.prisma.downloaderModule.findMany();
  }

  public readAllInstalledDownloaderModulesWithRepo() {
    return this.prisma.downloaderModule.findMany({
      include: { repo: true },
    });
  }

  public readDownloaderRepoById(id: number) {
    return this.prisma.downloaderRepo.findUnique({ where: { id } });
  }

  public updateInstalledDownloaderModuleCommit(
    repoId: number,
    moduleName: string,
    commit: string,
  ) {
    return this.prisma.downloaderModule.update({
      where: { repoId_moduleName: { repoId, moduleName } },
      data: { commit },
    });
  }
}
