import { randomUUID } from "node:crypto";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PrismaClient } from "@lumi/db";
import type { ModuleManifest } from "@lumi/module-runtime";
import type { Redis } from "ioredis";
import { isMissingPath, pathExists } from "./fs.js";
import { checkout, clone, fetch, head } from "./git.js";
import { AddonStorage } from "./storage.js";
import type {
  AddonLogger,
  AddonNotifier,
  AddonRuntime,
  AutoUpdateReport,
  AutoUpdateState,
  InstalledAddon,
  ModuleInfo,
  RepoRecord,
  RepoUpdateResult,
  UpdateFailure,
} from "./types.js";
import { validateAddon } from "./validate.js";

const AutoUpdateKey = "lumi:addons:autoupdate";
const RepoNameRe = /^[a-z][a-z0-9-]*$/;
const ModuleNameRe = /^[a-z][a-z0-9-]*$/;
const BranchRe = /^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*$/;
const DefaultAutoUpdate: AutoUpdateState = {
  enabled: false,
  intervalMinutes: 360,
  lastCheckedAt: null,
};

const NoopLogger: AddonLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface AddonManagerOptions {
  prisma: PrismaClient;
  redis: Redis;
  runtime: AddonRuntime;
  root?: string;
  logger?: AddonLogger;
  notify?: AddonNotifier;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertModuleName(name: string): void {
  if (!ModuleNameRe.test(name)) {
    throw new Error(`Invalid add-on name "${name}".`);
  }
}

export class AddonManager {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private readonly runtime: AddonRuntime;
  private readonly root: string;
  private readonly storage: AddonStorage;
  private readonly logger: AddonLogger;
  private readonly notify?: AddonNotifier;
  private queue: Promise<unknown> = Promise.resolve();
  private autoUpdateRunning = false;

  constructor(options: AddonManagerOptions) {
    this.prisma = options.prisma;
    this.redis = options.redis;
    this.runtime = options.runtime;
    this.root = resolve(options.root ?? process.cwd());
    this.storage = new AddonStorage(this.root);
    this.logger = options.logger ?? NoopLogger;
    this.notify = options.notify;
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async requireRepo(name: string) {
    const repo = await this.prisma.downloaderRepo.findUnique({ where: { name } });
    if (!repo) throw new Error(`Repository "${name}" is not tracked.`);
    return repo;
  }

  private async restoreRepo(dir: string, commit: string | null, url: string, branch: string | null): Promise<void> {
    if (commit) {
      await checkout(dir, commit);
      return;
    }
    await rm(dir, { recursive: true, force: true });
    await clone(url, dir, branch);
  }

  async listRepos(): Promise<RepoRecord[]> {
    const repos = await this.prisma.downloaderRepo.findMany({
      include: { _count: { select: { modules: true } } },
      orderBy: { name: "asc" },
    });
    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      url: repo.url,
      branch: repo.branch,
      commit: repo.commit,
      installed: repo._count.modules,
    }));
  }

  async addRepo(name: string, url: string, branch?: string): Promise<RepoRecord> {
    if (!RepoNameRe.test(name)) {
      throw new Error("Repository names must be lowercase letters, digits, and dashes.");
    }
    if (!/^https:\/\/[^\s]+$/.test(url)) {
      throw new Error("Repository URLs must be HTTPS.");
    }
    const ref = branch?.trim() || null;
    if (ref && !BranchRe.test(ref)) {
      throw new Error("Branch names may only contain letters, digits, dot, dash, and underscore.");
    }

    return this.run(async () => {
      if (await this.prisma.downloaderRepo.findUnique({ where: { name } })) {
        throw new Error(`Repository "${name}" is already tracked.`);
      }

      await mkdir(this.storage.reposDir, { recursive: true });
      const dir = this.storage.repoDir(name);

      if (await pathExists(join(dir, ".git"))) {
        const commit = await head(dir);
        const repo = await this.prisma.downloaderRepo.create({
          data: { name, url, branch: ref, commit },
        });
        this.logger.info(`Adopted existing clone for ${name}.`);
        return { ...repo, installed: 0 };
      }

      await rm(dir, { recursive: true, force: true });
      const staging = join(this.storage.reposDir, `.${name}-${randomUUID()}`);
      try {
        await clone(url, staging, ref);
        await rename(staging, dir);
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw new Error(`Clone failed: ${message(error)}`);
      }

      const commit = await head(dir);
      const repo = await this.prisma.downloaderRepo.create({
        data: { name, url, branch: ref, commit },
      });
      return { ...repo, installed: 0 };
    });
  }

  async removeRepo(name: string): Promise<void> {
    return this.run(async () => {
      const repo = await this.requireRepo(name);
      const installed = await this.prisma.downloaderModule.count({ where: { repoId: repo.id } });
      if (installed > 0) {
        throw new Error(`Uninstall ${installed} add-on(s) from "${name}" before removing it.`);
      }
      await rm(this.storage.repoDir(name), { recursive: true, force: true });
      await this.prisma.downloaderRepo.delete({ where: { id: repo.id } });
    });
  }

  async listRepoModules(name: string): Promise<ModuleInfo[]> {
    const repo = await this.requireRepo(name);
    const installedRows = await this.prisma.downloaderModule.findMany({
      where: { repoId: repo.id },
    });
    const installed = new Set(installedRows.map((row) => row.name));
    const dir = this.storage.repoDir(name);
    const entries = await readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
      if (!isMissingPath(error)) {
        this.logger.warn(`Could not list ${dir}: ${message(error)}`);
      }
      return [];
    });

    const candidates = entries.filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules",
    );
    const modules = await Promise.all(
      candidates.map(async (entry): Promise<ModuleInfo | null> => {
        const manifest = await this.storage.readManifest(join(dir, entry.name)).catch(() => null);
        if (!manifest) return null;
        return {
          name: manifest.name,
          displayName: manifest.displayName,
          emoji: manifest.emoji,
          description: manifest.description,
          version: manifest.version,
          installed: installed.has(manifest.name),
        };
      }),
    );

    return modules
      .filter((module): module is ModuleInfo => module !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async install(repoName: string, moduleName: string): Promise<void> {
    assertModuleName(moduleName);

    return this.run(async () => {
      const repo = await this.requireRepo(repoName);
      const source = join(this.storage.repoDir(repoName), moduleName);

      if (!(await pathExists(join(source, "manifest.json")))) {
        throw new Error(`Module "${moduleName}" was not found in "${repoName}".`);
      }

      const errors = await validateAddon(source);
      if (errors.length > 0) {
        throw new Error(`Validation failed:\n${errors.map((error) => `• ${error}`).join("\n")}`);
      }

      const manifest = await this.storage.readManifest(source);
      const existing = await this.prisma.downloaderModule.findUnique({
        where: { name: manifest.name },
        include: { repo: true },
      });
      if (existing) {
        throw new Error(`"${manifest.name}" is already installed from "${existing.repo.name}".`);
      }
      if (this.runtime.has(manifest.name)) {
        throw new Error(`"${manifest.name}" is already provided by a bundled module.`);
      }

      await this.assertNoConflicts(manifest);

      const target = this.storage.addonDir(manifest.name);
      const staging = await this.storage.stageModule(source);
      let committed = false;
      try {
        await this.storage.installRequirements(staging, manifest.requirements, manifest.name);
        await this.storage.commitModule(staging, target);
        committed = true;
        await this.prisma.downloaderModule.create({
          data: {
            name: manifest.name,
            repoId: repo.id,
            version: manifest.version,
            commit: repo.commit,
          },
        });
        await this.runtime.mount(manifest.name);
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        if (committed) {
          await rm(target, { recursive: true, force: true });
        }
        await this.prisma.downloaderModule.delete({ where: { name: manifest.name } }).catch(() => undefined);
        throw error;
      }

      this.logger.info(`Installed ${manifest.name} from ${repoName}.`);
    });
  }

  private async assertNoConflicts(manifest: ModuleManifest): Promise<void> {
    for (const conflict of manifest.conflicts) {
      if (this.runtime.has(conflict)) {
        throw new Error(`"${manifest.name}" conflicts with loaded module "${conflict}".`);
      }
    }

    const installed = await this.prisma.downloaderModule.findMany();
    for (const row of installed) {
      if (manifest.conflicts.includes(row.name)) {
        throw new Error(`"${manifest.name}" conflicts with installed add-on "${row.name}".`);
      }
    }

    const manifests = await Promise.all(
      installed.map(async (row) => ({
        row,
        manifest: await this.storage.readManifest(this.storage.addonDir(row.name)).catch(() => null),
      })),
    );
    for (const other of manifests) {
      if (other.manifest?.conflicts.includes(manifest.name)) {
        throw new Error(`Installed add-on "${other.row.name}" conflicts with "${manifest.name}".`);
      }
    }
  }

  async uninstall(moduleName: string): Promise<void> {
    return this.run(async () => {
      assertModuleName(moduleName);
      await this.runtime.unmount(moduleName).catch((error) => {
        this.logger.warn(`Could not unmount ${moduleName}: ${message(error)}`);
      });
      await rm(this.storage.addonDir(moduleName), { recursive: true, force: true });
      await rm(join(this.storage.backupsDir, moduleName), { recursive: true, force: true });
      await this.prisma.downloaderModule.delete({ where: { name: moduleName } }).catch(() => undefined);
    });
  }

  async setPinned(moduleName: string, pinned: boolean): Promise<void> {
    assertModuleName(moduleName);
    await this.prisma.downloaderModule.update({ where: { name: moduleName }, data: { pinned } });
  }

  async listInstalled(): Promise<InstalledAddon[]> {
    const rows = await this.prisma.downloaderModule.findMany({
      include: { repo: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      name: row.name,
      version: row.version,
      commit: row.commit,
      pinned: row.pinned,
      installedAt: row.installedAt,
      repoName: row.repo.name,
    }));
  }

  async updateRepo(name: string): Promise<RepoUpdateResult> {
    return this.run(async () => {
      const repo = await this.requireRepo(name);
      const dir = this.storage.repoDir(name);

      if (!(await pathExists(join(dir, ".git")))) {
        await rm(dir, { recursive: true, force: true });
        await clone(repo.url, dir, repo.branch);
      }

      const oldCommit = await head(dir);
      const fetched = await fetch(repo.url, dir, repo.branch);
      const newCommit = fetched ?? (await head(dir));
      if (!newCommit) throw new Error(`Repository "${name}" has no commits.`);

      if (newCommit === oldCommit) {
        await this.prisma.downloaderRepo.update({ where: { id: repo.id }, data: { commit: newCommit } });
        return {
          repo: name,
          oldCommit,
          newCommit,
          changed: false,
          updated: [],
          pinned: [],
          failures: [],
        };
      }

      const modules = await this.prisma.downloaderModule.findMany({ where: { repoId: repo.id } });
      const tracked = modules.filter((module) => !module.pinned);
      const pinned = modules.filter((module) => module.pinned).map((module) => module.name);
      const failures: UpdateFailure[] = [];

      try {
        await checkout(dir, newCommit);
      } catch (error) {
        await this.restoreRepo(dir, oldCommit, repo.url, repo.branch).catch((restoreError) => {
          this.logger.warn(`Could not restore ${name}: ${message(restoreError)}`);
        });
        throw error;
      }

      for (const module of tracked) {
        const errors = await validateAddon(join(dir, module.name)).catch((error) => [
          message(error),
        ]);
        if (errors.length > 0) {
          failures.push({ module: module.name, error: errors.join("; ") });
        }
      }

      if (failures.length > 0) {
        await this.restoreRepo(dir, oldCommit, repo.url, repo.branch);
        return { repo: name, oldCommit, newCommit, changed: false, updated: [], pinned, failures };
      }

      const applied: Array<{ name: string; version: string | null; commit: string | null }> = [];
      for (const module of tracked) {
        const target = this.storage.addonDir(module.name);
        const backup = join(this.storage.backupsDir, module.name);
        try {
          await mkdir(this.storage.backupsDir, { recursive: true });
          await rm(backup, { recursive: true, force: true });
          await cp(target, backup, { recursive: true, force: true });
        } catch (error) {
          failures.push({ module: module.name, error: message(error) });
          break;
        }

        applied.push({ name: module.name, version: module.version, commit: module.commit });
        let staging: string | null = null;
        try {
          const source = join(dir, module.name);
          const manifest = await this.storage.readManifest(source);
          staging = await this.storage.stageModule(source);
          await this.storage.installRequirements(staging, manifest.requirements, manifest.name);
          await this.storage.commitModule(staging, target);
          staging = null;
          await this.prisma.downloaderModule.update({
            where: { name: module.name },
            data: { version: manifest.version, commit: newCommit },
          });
          await this.runtime.reload(module.name);
        } catch (error) {
          if (staging) {
            await rm(staging, { recursive: true, force: true });
          }
          failures.push({ module: module.name, error: message(error) });
          break;
        }
      }

      if (failures.length > 0) {
        for (const module of applied) {
          const target = this.storage.addonDir(module.name);
          await rm(target, { recursive: true, force: true });
          await cp(join(this.storage.backupsDir, module.name), target, { recursive: true, force: true });
          await this.prisma.downloaderModule.update({
            where: { name: module.name },
            data: { version: module.version, commit: module.commit },
          });
          await this.runtime.reload(module.name).catch(() => undefined);
        }
        await this.restoreRepo(dir, oldCommit, repo.url, repo.branch);
        for (const module of applied) {
          await rm(join(this.storage.backupsDir, module.name), { recursive: true, force: true });
        }
        return { repo: name, oldCommit, newCommit, changed: false, updated: [], pinned, failures };
      }

      await this.prisma.downloaderRepo.update({ where: { id: repo.id }, data: { commit: newCommit } });
      for (const module of applied) {
        await rm(join(this.storage.backupsDir, module.name), { recursive: true, force: true });
      }

      return {
        repo: name,
        oldCommit,
        newCommit,
        changed: true,
        updated: applied.map((module) => module.name),
        pinned,
        failures,
      };
    });
  }

  async getAutoUpdate(): Promise<AutoUpdateState> {
    const raw = await this.redis.get(AutoUpdateKey);
    if (!raw) return { ...DefaultAutoUpdate };
    try {
      const parsed = JSON.parse(raw) as Partial<AutoUpdateState> | null;
      if (!parsed || typeof parsed !== "object") return { ...DefaultAutoUpdate };
      return { ...DefaultAutoUpdate, ...parsed };
    } catch (error) {
      this.logger.warn(`Ignoring unreadable auto-update state: ${message(error)}`);
      return { ...DefaultAutoUpdate };
    }
  }

  async setAutoUpdate(patch: Partial<AutoUpdateState>): Promise<AutoUpdateState> {
    const next = { ...(await this.getAutoUpdate()), ...patch };
    await this.redis.set(AutoUpdateKey, JSON.stringify(next));
    return next;
  }

  async autoUpdate(): Promise<AutoUpdateReport | null> {
    if (this.autoUpdateRunning) return null;
    this.autoUpdateRunning = true;
    try {
      return await this.runAutoUpdate();
    } finally {
      this.autoUpdateRunning = false;
    }
  }

  private async runAutoUpdate(): Promise<AutoUpdateReport | null> {
    const state = await this.getAutoUpdate();
    if (!state.enabled) return null;

    const lastChecked = state.lastCheckedAt ? Date.parse(state.lastCheckedAt) : 0;
    if (Date.now() - lastChecked < state.intervalMinutes * 60_000) return null;

    const repos = await this.prisma.downloaderRepo.findMany({
      where: { modules: { some: {} } },
      select: { name: true },
      orderBy: { name: "asc" },
    });

    const updated: string[] = [];
    const failures: UpdateFailure[] = [];
    for (const repo of repos) {
      try {
        const report = await this.updateRepo(repo.name);
        updated.push(...report.updated.map((module) => `${repo.name}/${module}`));
        failures.push(
          ...report.failures.map((failure) => ({
            module: `${repo.name}/${failure.module}`,
            error: failure.error,
          })),
        );
      } catch (error) {
        failures.push({ module: repo.name, error: message(error) });
      }
    }

    await this.setAutoUpdate({ lastCheckedAt: new Date().toISOString() });
    for (const failure of failures) {
      this.logger.warn(`Auto-update failed for ${failure.module}: ${failure.error}`);
    }

    const report = { checked: repos.length, updated, failures };
    if (this.notify && (report.updated.length > 0 || report.failures.length > 0)) {
      await this.notify(report).catch((error) =>
        this.logger.warn(`Failed to send auto-update report: ${message(error)}`),
      );
    }
    return report;
  }
}
