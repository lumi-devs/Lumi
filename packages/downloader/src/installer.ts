import { mkdir, readFile, readdir, rename, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import type {
  AddonAvailable,
  AddonControl,
  AddonModuleSummary,
  AddonUpdateOutcome,
} from "@lumi/contracts";
import type { DownloaderModule, DownloaderRepo } from "@lumi/db";
import type { Logger } from "@lumi/foundation";
import type { RedisClient } from "@lumi/redis";
import { withLock } from "@lumi/redis";
import { parseManifest, type ModuleManifest } from "@lumi/module-runtime";
import { checkout, clone, fetch, head, materialize, resolveRevision } from "./git.ts";
import { installAddonRequirements } from "./requirements.ts";
import { validateAddon } from "./validate.ts";

const NamePattern = /^[a-z][a-z0-9-]*$/;
const BranchPattern = /^[A-Za-z0-9._/-]+$/;

export interface InstallerStore {
  listRepos(): Promise<DownloaderRepo[]>;
  getRepo(name: string): Promise<DownloaderRepo | null>;
  upsertRepo(repo: {
    name: string;
    url: string;
    branch: string;
    commit: string;
  }): Promise<DownloaderRepo>;
  deleteRepo(name: string): Promise<void>;
  listInstalled(): Promise<DownloaderModule[]>;
  getInstalled(moduleName: string): Promise<DownloaderModule | null>;
  recordModule(record: {
    repoName: string;
    moduleName: string;
    version: string;
    commit: string;
  }): Promise<void>;
  deleteModule(moduleName: string): Promise<void>;
}

export interface InstallerOptions {
  root: string;
  store: InstallerStore;
  redis: RedisClient;
  logger: Logger;
  onInstalled?: ((moduleName: string) => Promise<void>) | undefined;
  onRemoved?: ((moduleName: string) => Promise<void>) | undefined;
}

export interface InstalledAddon {
  manifest: ModuleManifest;
  commit: string;
  previousVersion: string | null;
}

export interface RepoUpdate {
  name: string;
  oldSha: string;
  newSha: string;
  changed: boolean;
  modules: string[];
}

function assertName(value: string, label: string): string {
  if (!NamePattern.test(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

function parseUrl(raw: string): string {
  const value = raw.trim().replace(/^<|>$/g, "");
  if (value.startsWith("https://") || value.startsWith("http://")) {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid repository URL");
    return value;
  }
  throw new Error("Repository URL must be HTTP(S); git and SSH transports are not supported");
}

async function exists(target: string): Promise<boolean> {
  return stat(target).then(() => true).catch(() => false);
}

export class AddonInstaller implements AddonControl {
  readonly #root: string;
  readonly #store: InstallerStore;
  readonly #redis: RedisClient;
  readonly #logger: Logger;
  readonly #onInstalled: ((moduleName: string) => Promise<void>) | undefined;
  readonly #onRemoved: ((moduleName: string) => Promise<void>) | undefined;

  public readonly reposRoot: string;
  public readonly addonsRoot: string;
  public readonly versionsRoot: string;

  public constructor(options: InstallerOptions) {
    this.#root = path.resolve(options.root);
    this.#store = options.store;
    this.#redis = options.redis;
    this.#logger = options.logger;
    this.#onInstalled = options.onInstalled;
    this.#onRemoved = options.onRemoved;
    this.reposRoot = path.join(this.#root, "data", "repos");
    this.addonsRoot = path.join(this.#root, "data", "addons");
    this.versionsRoot = path.join(this.addonsRoot, ".versions");
  }

  public addRepo(name: string, url: string, branch = "default"): Promise<DownloaderRepo> {
    assertName(name, "repository name");
    return this.#locked(`addon:repo:${name}`, 300_000, () => this.#addRepo(name, url, branch));
  }

  async #addRepo(name: string, url: string, branch: string): Promise<DownloaderRepo> {
    const cleanUrl = parseUrl(url);
    if (branch !== "default" && !BranchPattern.test(branch)) throw new Error(`Invalid branch: ${branch}`);

    await mkdir(this.reposRoot, { recursive: true });
    const repoPath = path.join(this.reposRoot, name);

    if (await exists(path.join(repoPath, ".git"))) {
      const existing = await this.#store.getRepo(name);
      if (existing) throw new Error(`Repository '${name}' is already installed`);
      const sha = await head(repoPath);
      return this.#store.upsertRepo({ name, url: cleanUrl, branch, commit: sha });
    }
    if (await exists(repoPath)) await rm(repoPath, { recursive: true, force: true });

    const temp = path.join(this.reposRoot, `.${name}.${crypto.randomUUID()}.tmp`);
    try {
      const sha = await clone(cleanUrl, temp, branch);
      await rename(temp, repoPath);
      return this.#store.upsertRepo({ name, url: cleanUrl, branch, commit: sha });
    } catch (error) {
      await rm(temp, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  public updateRepo(name: string): Promise<RepoUpdate> {
    assertName(name, "repository name");
    return this.#locked(`addon:repo:${name}`, 300_000, () => this.#updateRepo(name));
  }

  async #updateRepo(name: string): Promise<RepoUpdate> {
    const repo = await this.#requireRepo(name);
    const repoPath = path.join(this.reposRoot, name);
    if (!(await exists(path.join(repoPath, ".git")))) throw new Error(`Repository '${name}' is missing from disk`);

    const oldSha = repo.commit;
    const newSha = await fetch(repoPath, repo.branch);
    if (!newSha) throw new Error(`Could not resolve the fetched revision for '${name}'`);
    if (newSha === oldSha) {
      return { name, oldSha, newSha, changed: false, modules: [] };
    }

    const installed = (await this.#store.listInstalled()).filter((module) => module.repoId === repo.id);
    const staging = path.join(this.#root, "data", "tmp", `${name}-${crypto.randomUUID()}`);
    try {
      for (const module of installed) {
        const dir = path.join(staging, module.moduleName);
        await materialize(repoPath, newSha, dir, module.moduleName);
        const validation = await validateAddon(dir);
        if (validation.errors.length > 0) {
          throw new Error(
            `Repository '${name}' update failed validation for ${module.moduleName}:\n${validation.errors
              .map((error) => `• ${error}`)
              .join("\n")}`,
          );
        }
      }
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }

    const modules: string[] = [];
    for (const module of installed) {
      await this.install(name, module.moduleName, newSha);
      modules.push(module.moduleName);
    }

    await checkout(repoPath, newSha);
    await this.#store.upsertRepo({
      name,
      url: repo.url,
      branch: repo.branch,
      commit: newSha,
    });

    return { name, oldSha, newSha, changed: true, modules };
  }

  public async updateAll(): Promise<readonly AddonUpdateOutcome[]> {
    const results: AddonUpdateOutcome[] = [];
    for (const repo of await this.#store.listRepos()) {
      try {
        results.push(await this.updateRepo(repo.name));
      } catch (error) {
        results.push({ name: repo.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  public install(repoName: string, moduleName: string, revision?: string): Promise<InstalledAddon> {
    assertName(moduleName, "module name");
    return this.#locked(`addon:module:${moduleName}`, 300_000, () =>
      this.#install(repoName, moduleName, revision),
    );
  }

  async #install(repoName: string, moduleName: string, revision: string | undefined): Promise<InstalledAddon> {
    const repo = await this.#requireRepo(repoName);
    const repoPath = path.join(this.reposRoot, repoName);
    if (!(await exists(path.join(repoPath, ".git")))) throw new Error(`Repository '${repoName}' is missing from disk`);

    const commit = revision ? await resolveRevision(repoPath, revision) : await head(repoPath);
    const installed = await this.#store.getInstalled(moduleName);
    if (installed && installed.repoId !== repo.id) {
      throw new Error(`Module '${moduleName}' is already installed from another repository`);
    }

    const staging = path.join(this.versionsRoot, moduleName, `.staging-${crypto.randomUUID()}`);
    const stagedModule = path.join(staging, moduleName);
    await mkdir(staging, { recursive: true });
    try {
      await materialize(repoPath, commit, stagedModule, moduleName);
      const validation = await validateAddon(stagedModule);
      if (validation.errors.length > 0) {
        throw new Error(
          `Module '${moduleName}' failed validation:\n${validation.errors.map((error) => `• ${error}`).join("\n")}`,
        );
      }
      const manifest = parseManifest(
        JSON.parse(await readFile(path.join(stagedModule, "manifest.json"), "utf8")),
      );
      await installAddonRequirements(stagedModule, manifest.requirements, this.#logger);

      const versionDir = path.join(this.versionsRoot, moduleName, commit);
      await rm(versionDir, { recursive: true, force: true });
      await rename(stagedModule, versionDir);
      await rm(staging, { recursive: true, force: true });

      const link = path.join(this.addonsRoot, moduleName);
      const tempLink = path.join(this.addonsRoot, `.${moduleName}.${crypto.randomUUID()}.tmp`);
      await mkdir(this.addonsRoot, { recursive: true });
      await symlink(versionDir, tempLink, "dir");
      await rename(tempLink, link);
      await this.#pruneVersions(moduleName, commit).catch((error: unknown) => {
        this.#logger.warn({ error, module: moduleName }, "failed to prune old addon versions");
      });

      await this.#store.recordModule({
        repoName,
        moduleName,
        version: manifest.version,
        commit,
      });

      this.#logger.info({ module: moduleName, repo: repoName, commit }, "addon installed");
      await this.#onInstalled?.(moduleName).catch((error: unknown) => {
        this.#logger.error({ error, module: moduleName }, "addon installed but reload failed");
      });

      return { manifest, commit, previousVersion: installed?.commit ?? null };
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  public uninstall(moduleName: string): Promise<void> {
    assertName(moduleName, "module name");
    return this.#locked(`addon:module:${moduleName}`, 120_000, () => this.#uninstall(moduleName));
  }

  async #uninstall(moduleName: string): Promise<void> {
    const installed = await this.#store.getInstalled(moduleName);
    if (!installed) throw new Error(`Module '${moduleName}' is not installed`);

    await this.#onRemoved?.(moduleName).catch((error: unknown) => {
      this.#logger.error({ error, module: moduleName }, "addon unload failed");
    });
    await rm(path.join(this.addonsRoot, moduleName), { force: true });
    await rm(path.join(this.versionsRoot, moduleName), { recursive: true, force: true });
    await this.#store.deleteModule(moduleName);
    this.#logger.info({ module: moduleName }, "addon uninstalled");
  }

  public removeRepo(name: string): Promise<void> {
    assertName(name, "repository name");
    return this.#locked(`addon:repo:${name}`, 120_000, () => this.#removeRepo(name));
  }

  async #removeRepo(name: string): Promise<void> {
    const repo = await this.#requireRepo(name);
    const installed = (await this.#store.listInstalled()).filter((module) => module.repoId === repo.id);
    if (installed.length > 0) {
      throw new Error(`Uninstall ${installed.map((module) => module.moduleName).join(", ")} before removing '${name}'`);
    }
    await rm(path.join(this.reposRoot, name), { recursive: true, force: true });
    await this.#store.deleteRepo(name);
  }

  public async listInstalled(): Promise<readonly AddonModuleSummary[]> {
    const [modules, repos] = await Promise.all([
      this.#store.listInstalled(),
      this.#store.listRepos(),
    ]);
    const repoById = new Map(repos.map((repo) => [repo.id, repo.name]));
    return modules.map((module) => {
      const repoName = repoById.get(module.repoId);
      return {
        moduleName: module.moduleName,
        version: module.version,
        commit: module.commit,
        ...(repoName === undefined ? {} : { repoName }),
      };
    });
  }

  public listRepos(): Promise<readonly DownloaderRepo[]> {
    return this.#store.listRepos();
  }

  public async listAvailable(repoName: string): Promise<readonly AddonAvailable[]> {
    const repo = await this.#requireRepo(repoName);
    const repoPath = path.join(this.reposRoot, repo.name);
    const entries = await readdir(repoPath, { withFileTypes: true }).catch(() => []);
    const available: AddonAvailable[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const dir = path.join(repoPath, entry.name);
      if (!(await exists(path.join(dir, "manifest.json")))) continue;
      try {
        const manifest = parseManifest(JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")));
        const validation = await validateAddon(dir);
        available.push({
          name: manifest.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          errors: validation.errors,
          warnings: validation.warnings,
        });
      } catch {
        continue;
      }
    }
    return available;
  }

  async #pruneVersions(moduleName: string, keep: string): Promise<void> {
    const directory = path.join(this.versionsRoot, moduleName);
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== keep && !entry.name.startsWith("."))
        .map((entry) => rm(path.join(directory, entry.name), { recursive: true, force: true })),
    );
  }

  async #locked<T>(key: string, ttlMs: number, work: () => Promise<T>): Promise<T> {
    const result = await withLock(this.#redis, key, ttlMs, work);
    if (!result.acquired) throw new Error("Another addon operation is already running");
    return result.value;
  }

  async #requireRepo(name: string): Promise<DownloaderRepo> {
    const repo = await this.#store.getRepo(name);
    if (!repo) throw new Error(`Unknown repository: ${name}`);
    return repo;
  }
}
