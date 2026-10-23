import type { DownloaderModule, DownloaderRepo } from "../../generated/client/index.js";
import { Repository, type RepositoryDeps } from "./base.ts";

export interface RepoRecord {
  name: string;
  url: string;
  branch: string;
  commit: string;
}

export interface ModuleRecord {
  repoName: string;
  moduleName: string;
  version: string;
  commit: string;
}

export class DownloaderRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  public listRepos(): Promise<DownloaderRepo[]> {
    return this.reader.downloaderRepo.findMany({ orderBy: { name: "asc" } });
  }

  public getRepo(name: string): Promise<DownloaderRepo | null> {
    return this.reader.downloaderRepo.findUnique({ where: { name } });
  }

  public async upsertRepo(repo: RepoRecord): Promise<DownloaderRepo> {
    return this.prisma.downloaderRepo.upsert({
      where: { name: repo.name },
      update: {
        url: repo.url,
        branch: repo.branch,
        commit: repo.commit,
      },
      create: {
        name: repo.name,
        url: repo.url,
        branch: repo.branch,
        commit: repo.commit,
      },
    });
  }

  public async deleteRepo(name: string): Promise<void> {
    await this.prisma.downloaderRepo.deleteMany({ where: { name } });
  }

  public listInstalled(): Promise<DownloaderModule[]> {
    return this.reader.downloaderModule.findMany({ orderBy: { moduleName: "asc" } });
  }

  public getInstalled(moduleName: string): Promise<DownloaderModule | null> {
    return this.reader.downloaderModule.findUnique({ where: { moduleName } });
  }

  public async recordModule(record: ModuleRecord): Promise<void> {
    const repo = await this.prisma.downloaderRepo.findUnique({ where: { name: record.repoName } });
    if (!repo) throw new Error(`Unknown repo: ${record.repoName}`);
    await this.prisma.downloaderModule.upsert({
      where: { repoId_moduleName: { repoId: repo.id, moduleName: record.moduleName } },
      update: {
        version: record.version,
        commit: record.commit,
      },
      create: {
        repoId: repo.id,
        moduleName: record.moduleName,
        version: record.version,
        commit: record.commit,
      },
    });
  }

  public async deleteModule(moduleName: string): Promise<void> {
    await this.prisma.downloaderModule.deleteMany({ where: { moduleName } });
  }
}
