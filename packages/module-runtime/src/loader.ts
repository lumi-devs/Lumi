import type { Dirent } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { logger } from "@lumi/foundation";
import type {
  Disposer,
  ModuleDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { type ModuleManifest, validateManifest } from "./manifest.js";

export type ModuleSummary = Pick<
  ModuleManifest,
  | "name"
  | "displayName"
  | "emoji"
  | "description"
  | "version"
  | "category"
  | "configFields"
  | "configKey"
> & {
  origin: "bundled" | "addon";
};

export interface LoadedModule {
  manifest: ModuleManifest;
  definition: ModuleDefinition;
  path: string;
  origin: "bundled" | "addon";
  guildsDisabled: Set<string>;
}

function isMissingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function importKey(entryPath: string): string {
  importGeneration += 1;
  return `${entryPath}?v=${importGeneration}`;
}

let importGeneration = 0;

interface SemverApi {
  satisfies: (version: string, range: string) => boolean;
}

function semverApi(): SemverApi | undefined {
  const runtime = globalThis as { Bun?: { semver?: SemverApi } };
  return runtime.Bun?.semver;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function matchesComparator(
  version: ParsedVersion,
  comparator: string,
): boolean {
  const operator = /^(>=|<=|>|<|=|\^|~)/.exec(comparator)?.[1] ?? "";
  const target = parseVersion(comparator.slice(operator.length));
  if (!target) return false;
  const order = compareVersions(version, target);
  switch (operator) {
    case "^":
      if (target.major > 0) return version.major === target.major && order >= 0;
      if (target.minor > 0) {
        return (
          version.major === 0 && version.minor === target.minor && order >= 0
        );
      }
      return order === 0;
    case "~":
      return (
        version.major === target.major &&
        version.minor === target.minor &&
        order >= 0
      );
    case ">=":
      return order >= 0;
    case ">":
      return order > 0;
    case "<=":
      return order <= 0;
    case "<":
      return order < 0;
    default:
      return order === 0;
  }
}

function satisfiesRange(version: string, range: string): boolean {
  const api = semverApi();
  if (api) return api.satisfies(version, range);

  const parsed = parseVersion(version);
  if (!parsed) return false;
  const alternatives = range
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);
  if (alternatives.length === 0) return true;
  return alternatives.some((alternative) =>
    alternative
      .split(/\s+/)
      .every((comparator) =>
        comparator === "*" || comparator === "x" || comparator === "X"
          ? true
          : matchesComparator(parsed, comparator),
      ),
  );
}

export type DependencyIssue =
  | { module: string; dependency: string; reason: "missing" }
  | {
      module: string;
      dependency: string;
      reason: "unsatisfied";
      required: string;
      found: string;
    };

export function checkDependencies(
  moduleName: string,
  dependencies: Readonly<Record<string, string>>,
  available: ReadonlyMap<string, string>,
): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  for (const [dependency, range] of Object.entries(dependencies)) {
    const found = available.get(dependency);
    if (found === undefined) {
      issues.push({ module: moduleName, dependency, reason: "missing" });
    } else if (!satisfiesRange(found, range)) {
      issues.push({
        module: moduleName,
        dependency,
        reason: "unsatisfied",
        required: range,
        found,
      });
    }
  }
  return issues;
}

export class ModuleLoader {
  private modules = new Map<string, LoadedModule>();
  private moduleServices = new Map<string, ModuleServices>();
  private moduleDisposers = new Map<string, Disposer[]>();
  private roots: Array<{ path: string; origin: "bundled" | "addon" }> = [];
  private services: ModuleServices | null = null;
  private dependents = new Map<string, Set<string>>();
  private requireServices(): ModuleServices {
    if (!this.services) {
      throw new Error(
        "ModuleLoader.loadAll must run before module services are used.",
      );
    }
    return this.services;
  }

  private async runDisposers(moduleName: string): Promise<void> {
    const disposers = this.moduleDisposers.get(moduleName);
    if (!disposers) return;
    this.moduleDisposers.delete(moduleName);
    for (const dispose of disposers) {
      try {
        await dispose();
      } catch (error) {
        logger.error(`Failed to dispose module ${moduleName}:`, error);
      }
    }
  }

  addRoot(path: string, origin: "bundled" | "addon"): void {
    this.roots.push({ path: resolve(path), origin });
  }

  async discover(): Promise<LoadedModule[]> {
    const discovered: LoadedModule[] = [];

    for (const root of this.roots) {
      await this.discoverDirectory(root.path, root.origin, discovered, 0);
    }

    const seen = new Set<string>();
    return discovered
      .filter((module) => {
        const name = module.manifest.name;
        if (seen.has(name)) {
          logger.error(
            `Duplicate module "${name}" in ${module.path}; skipping.`,
          );
          return false;
        }
        seen.add(name);
        return true;
      })
      .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  }

  private async discoverDirectory(
    dir: string,
    origin: "bundled" | "addon",
    discovered: LoadedModule[],
    depth: number,
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (!isMissingPath(error)) {
        logger.error(`Error discovering modules in ${dir}:`, error);
      }
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "data") continue;

      const modulePath = join(dir, entry.name);
      const manifest = await this.readManifest(modulePath);
      if (!manifest) {
        // Bundled modules can be nested in categories up to depth 4 (e.g. category/sub/module).
        // Addons must be strictly flat direct folders under the addons root directory (no subdir recursion).
        if (origin === "bundled" && depth < 4) {
          await this.discoverDirectory(
            modulePath,
            origin,
            discovered,
            depth + 1,
          );
        }
        continue;
      }

      const definition = await this.loadDefinition(modulePath, manifest);
      if (!definition) continue;

      discovered.push({
        manifest,
        definition,
        path: modulePath,
        origin,
        guildsDisabled: new Set(),
      });
    }
  }

  private async readManifest(dir: string): Promise<ModuleManifest | null> {
    let content: string;
    try {
      content = await readFile(join(dir, "manifest.json"), "utf-8");
    } catch (error) {
      if (!isMissingPath(error)) {
        logger.error(`Failed to read manifest in ${dir}:`, error);
      }
      return null;
    }

    try {
      return validateManifest(JSON.parse(content));
    } catch (error) {
      logger.error(`Invalid manifest in ${dir}:`, error);
      return null;
    }
  }

  private entryPath(dir: string, entry: string): string | null {
    const root = resolve(dir);
    const target = resolve(root, entry);
    return target.startsWith(root + sep) ? target : null;
  }

  private async loadDefinition(
    dir: string,
    manifest: ModuleManifest,
  ): Promise<ModuleDefinition | null> {
    const entryPath = this.entryPath(dir, manifest.entry);
    if (!entryPath) {
      logger.error(
        `Module ${manifest.name} has an unsafe entry path "${manifest.entry}".`,
      );
      return null;
    }

    try {
      const [realRoot, realEntry] = await Promise.all([
        realpath(resolve(dir)),
        realpath(entryPath),
      ]);
      if (!realEntry.startsWith(realRoot + sep)) {
        logger.error(
          `Module ${manifest.name} entry "${manifest.entry}" resolves outside the module directory.`,
        );
        return null;
      }

      const mod = (await import(importKey(entryPath))) as {
        default?: ModuleDefinition;
      };
      const definition = mod.default;
      if (!definition) {
        logger.error(`Module ${manifest.name} has no default export.`);
        return null;
      }
      if (definition.name !== manifest.name) {
        logger.error(
          `Module name mismatch: ${definition.name} !== ${manifest.name}.`,
        );
        return null;
      }
      return definition;
    } catch (error) {
      logger.error(`Failed to load module ${manifest.name}:`, error);
      return null;
    }
  }

  async loadAll(
    discovered: LoadedModule[],
    services: ModuleServices,
  ): Promise<LoadedModule[]> {
    this.services = services;
    this.dependents.clear();
    const { ordered, cyclic } = this.sortModules(discovered);
    for (const name of cyclic) {
      logger.error(`Module ${name} is part of a dependency cycle; skipping.`);
    }

    const available = new Map(
      ordered.map((module) => [module.manifest.name, module.manifest.version]),
    );

    for (const module of ordered) {
      const name = module.manifest.name;
      if (this.modules.has(name)) continue;

      const conflict = module.manifest.conflicts.find(
        (other) => other !== name && available.has(other),
      );
      if (conflict) {
        logger.warn(`Module ${name} conflicts with ${conflict}, skipping.`);
        continue;
      }

      const dependencyIssues = checkDependencies(
        name,
        module.manifest.dependencies,
        available,
      );
      for (const issue of dependencyIssues) {
        if (issue.reason === "missing") {
          logger.warn(
            `Module ${name} depends on missing module ${issue.dependency}.`,
          );
        } else {
          logger.warn(
            `Module ${name} requires ${issue.dependency}@${issue.required} but found ${issue.found}, skipping.`,
          );
        }
      }
      if (dependencyIssues.length > 0) {
        continue;
      }

      for (const dep of Object.keys(module.manifest.dependencies)) {
        const set = this.dependents.get(dep);
        if (set) set.add(name);
        else this.dependents.set(dep, new Set([name]));
      }

      const moduleServices: ModuleServices = { ...services, moduleName: name };
      let disposers: Disposer[] = [];
      try {
        disposers = await module.definition.onLoad(moduleServices);
      } catch (error) {
        logger.error(`Failed to initialize module ${name}:`, error);
        continue;
      }

      this.moduleServices.set(name, moduleServices);
      this.modules.set(name, module);
      this.moduleDisposers.set(name, Array.isArray(disposers) ? disposers : []);
    }

    return Array.from(this.modules.values());
  }

  private sortModules(modules: LoadedModule[]): {
    ordered: LoadedModule[];
    cyclic: string[];
  } {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    const moduleMap = new Map<string, LoadedModule>();

    for (const module of modules) {
      const name = module.manifest.name;
      moduleMap.set(name, module);
      graph.set(name, new Set());
      inDegree.set(name, 0);
    }

    for (const module of modules) {
      const name = module.manifest.name;
      for (const dep of Object.keys(module.manifest.dependencies)) {
        const dependents = graph.get(dep);
        if (!dependents) continue;
        dependents.add(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }

    const queue = Array.from(inDegree.entries())
      .filter(([, degree]) => degree === 0)
      .map(([name]) => name);

    const ordered: LoadedModule[] = [];
    while (queue.length > 0) {
      const name = queue.shift()!;
      const module = moduleMap.get(name);
      if (module) ordered.push(module);

      for (const dependent of graph.get(name) ?? []) {
        const degree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, degree);
        if (degree === 0) queue.push(dependent);
      }
    }

    const orderedNames = new Set(ordered.map((module) => module.manifest.name));
    const cyclic = modules
      .filter((module) => !orderedNames.has(module.manifest.name))
      .map((module) => module.manifest.name);

    return { ordered, cyclic };
  }

  async setEnabled(
    moduleName: string,
    guildId: string,
    enabled: boolean,
  ): Promise<void> {
    const module = this.modules.get(moduleName);
    if (!module) return;

    if (enabled) {
      module.guildsDisabled.delete(guildId);
    } else {
      module.guildsDisabled.add(guildId);
    }
  }

  isEnabled(guildId: string, moduleName: string): boolean {
    const module = this.modules.get(moduleName);
    if (!module) return false;
    return !module.guildsDisabled.has(guildId);
  }

  isActive(guildId: string, moduleName: string): boolean {
    return this.isEnabled(guildId, moduleName);
  }

  async reload(moduleName: string): Promise<void> {
    const module = this.modules.get(moduleName);
    if (!module) return;

    const freshManifest = await this.readManifest(module.path);
    if (!freshManifest) {
      throw new Error(
        `Failed to read or validate manifest for module "${moduleName}" during reload.`,
      );
    }

    const services = this.moduleServices.get(moduleName) ?? {
      ...this.requireServices(),
      moduleName,
    };

    try {
      await module.definition.onUnload(services);
    } catch (error) {
      logger.error(
        `Error during onUnload while reloading module "${moduleName}":`,
        error,
      );
    } finally {
      await this.runDisposers(moduleName);
    }

    const definition = await this.loadDefinition(module.path, freshManifest);
    if (!definition) {
      throw new Error(`Failed to reload module "${moduleName}": invalid definition.`);
    }

    module.manifest = freshManifest;
    module.definition = definition;
    try {
      const disposers = await definition.onLoad(services);
      this.moduleDisposers.set(
        moduleName,
        Array.isArray(disposers) ? disposers : [],
      );
    } catch (error) {
      logger.error(
        `Error during onLoad while reloading module "${moduleName}":`,
        error,
      );
      throw error;
    }
  }

  async unload(moduleName: string): Promise<LoadedModule[]> {
    const module = this.modules.get(moduleName);
    if (!module) return [];

    const toUnload = new Set<string>([moduleName]);
    const queue = [moduleName];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = this.dependents.get(current);
      if (deps) {
        for (const dep of deps) {
          if (!toUnload.has(dep) && this.modules.has(dep)) {
            toUnload.add(dep);
            queue.push(dep);
          }
        }
      }
    }

    const removed: LoadedModule[] = [];
    for (const name of toUnload) {
      const mod = this.modules.get(name);
      if (!mod) continue;
      removed.push(mod);
    }

    removed.sort((a, b) => {
      const aDependsOnB = this.dependents
        .get(b.manifest.name)
        ?.has(a.manifest.name);
      const bDependsOnA = this.dependents
        .get(a.manifest.name)
        ?.has(b.manifest.name);
      if (aDependsOnB && !bDependsOnA) return -1;
      if (bDependsOnA && !aDependsOnB) return 1;
      return 0;
    });

    for (const module of removed) {
      const name = module.manifest.name;
      const services = this.moduleServices.get(name) ?? this.requireServices();
      try {
        await module.definition.onUnload(services);
      } catch (error) {
        logger.error(`Failed to unload module ${name}:`, error);
      }
      await this.runDisposers(name);
      this.modules.delete(name);
      this.moduleServices.delete(name);
      this.dependents.delete(name);
      for (const set of this.dependents.values()) {
        set.delete(name);
      }
    }

    return removed;
  }

  getModule(moduleName: string): LoadedModule | undefined {
    return this.modules.get(moduleName);
  }

  listAll(): LoadedModule[] {
    return Array.from(this.modules.values());
  }

  listGlobal(): ModuleSummary[] {
    return Array.from(this.modules.values()).map((module) => ({
      name: module.manifest.name,
      displayName: module.manifest.displayName,
      emoji: module.manifest.emoji,
      description: module.manifest.description,
      version: module.manifest.version,
      category: module.manifest.category,
      configFields: module.manifest.configFields,
      configKey: module.manifest.configKey,
      origin: module.origin,
    }));
  }
}

export function createModuleLoader(): ModuleLoader {
  return new ModuleLoader();
}
