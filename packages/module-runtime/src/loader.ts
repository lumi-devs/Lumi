import type { Dirent } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ModuleDefinition, ModuleServices } from "@lumi/module-kit";
import { type ModuleManifest, validateManifest } from "./manifest.js";

export type ModuleSummary = Pick<
  ModuleManifest,
  "name" | "displayName" | "emoji" | "description" | "version" | "configFields"
> & {
  isSubmodule: boolean;
  supermodule?: string;
};

export interface LoadedModule {
  manifest: ModuleManifest;
  definition: ModuleDefinition;
  path: string;
  origin: "bundled" | "addon";
  supermodule?: string;
  isSubmodule: boolean;
  guildsDisabled: Set<string>;
}

interface DiscoveryContext {
  origin: "bundled" | "addon";
  discovered: LoadedModule[];
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

/** Fallback for the operators manifests use when `Bun.semver` is unavailable. */
function matchesComparator(version: ParsedVersion, comparator: string): boolean {
  const operator = /^(>=|<=|>|<|=|\^|~)/.exec(comparator)?.[1] ?? "";
  const target = parseVersion(comparator.slice(operator.length));
  if (!target) return false;
  const order = compareVersions(version, target);
  switch (operator) {
    case "^":
      if (target.major > 0) return version.major === target.major && order >= 0;
      if (target.minor > 0) {
        return version.major === 0 && version.minor === target.minor && order >= 0;
      }
      return order === 0;
    case "~":
      return version.major === target.major && version.minor === target.minor && order >= 0;
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
    alternative.split(/\s+/).every((comparator) =>
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
  private roots: Array<{ path: string; origin: "bundled" | "addon" }> = [];
  private services: any = {};

  addRoot(path: string, origin: "bundled" | "addon"): void {
    this.roots.push({ path: resolve(path), origin });
  }

  async discover(): Promise<LoadedModule[]> {
    const discovered: LoadedModule[] = [];

    for (const root of this.roots) {
      let entries: Dirent[];
      try {
        entries = await readdir(root.path, { withFileTypes: true });
      } catch (error) {
        if (!isMissingPath(error)) {
          console.error(`Error discovering modules in ${root.path}:`, error);
        }
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

        const modulePath = join(root.path, entry.name);
        const manifest = await this.readManifest(modulePath);
        if (!manifest) continue;
        if (entry.name !== manifest.name) {
          console.error(
            `Module directory "${entry.name}" does not match manifest name "${manifest.name}".`,
          );
          continue;
        }

        await this.discoverSupermodule(modulePath, manifest, {
          origin: root.origin,
          discovered,
        });
      }
    }

    return discovered;
  }

  private async readManifest(dir: string): Promise<ModuleManifest | null> {
    let content: string;
    try {
      content = await readFile(join(dir, "manifest.json"), "utf-8");
    } catch (error) {
      if (!isMissingPath(error)) {
        console.error(`Failed to read manifest in ${dir}:`, error);
      }
      return null;
    }

    try {
      return validateManifest(JSON.parse(content));
    } catch (error) {
      console.error(`Invalid manifest in ${dir}:`, error);
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
      console.error(
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
        console.error(
          `Module ${manifest.name} entry "${manifest.entry}" resolves outside the module directory.`,
        );
        return null;
      }

      const mod = (await import(importKey(entryPath))) as {
        default?: ModuleDefinition;
      };
      const definition = mod.default;
      if (!definition) {
        console.error(`Module ${manifest.name} has no default export.`);
        return null;
      }
      if (definition.name !== manifest.name) {
        console.error(
          `Module name mismatch: ${definition.name} !== ${manifest.name}.`,
        );
        return null;
      }
      return definition;
    } catch (error) {
      console.error(`Failed to load module ${manifest.name}:`, error);
      return null;
    }
  }

  private async discoverSupermodule(
    modulePath: string,
    manifest: ModuleManifest,
    context: DiscoveryContext,
  ): Promise<void> {
    const definition = await this.loadDefinition(modulePath, manifest);
    if (!definition) return;

    context.discovered.push({
      manifest,
      definition,
      path: modulePath,
      origin: context.origin,
      isSubmodule: false,
      guildsDisabled: new Set(),
    });

    let entries: Dirent[];
    try {
      entries = await readdir(modulePath, { withFileTypes: true });
    } catch (error) {
      if (!isMissingPath(error)) {
        console.error(`Failed to read submodules of ${manifest.name}:`, error);
      }
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const subPath = join(modulePath, entry.name);
      const subManifest = await this.readManifest(subPath);
      if (!subManifest) continue;
      if (entry.name !== subManifest.name) {
        console.error(
          `Submodule directory "${entry.name}" does not match manifest name "${subManifest.name}".`,
        );
        continue;
      }

      const subDefinition = await this.loadDefinition(subPath, subManifest);
      if (!subDefinition) continue;

      context.discovered.push({
        manifest: subManifest,
        definition: subDefinition,
        path: subPath,
        origin: context.origin,
        supermodule: manifest.name,
        isSubmodule: true,
        guildsDisabled: new Set(),
      });
    }
  }

  async loadAll(discovered: LoadedModule[], services: any): Promise<LoadedModule[]> {
    this.services = services;
    const { ordered, cyclic } = this.sortModules(discovered);
    for (const name of cyclic) {
      console.error(`Module ${name} is part of a dependency cycle; skipping.`);
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
        console.warn(`Module ${name} conflicts with ${conflict}, skipping.`);
        continue;
      }

      const dependencyIssues = checkDependencies(
        name,
        module.manifest.dependencies,
        available,
      );
      for (const issue of dependencyIssues) {
        if (issue.reason === "missing") {
          console.warn(`Module ${name} depends on missing module ${issue.dependency}.`);
        } else {
          console.warn(
            `Module ${name} requires ${issue.dependency}@${issue.required} but found ${issue.found}, skipping.`,
          );
        }
      }
      if (dependencyIssues.some((issue) => issue.reason === "unsatisfied")) {
        continue;
      }

      const moduleServices: ModuleServices = { ...services, __moduleName: name };
      try {
        await module.definition.onLoad(moduleServices);
      } catch (error) {
        console.error(`Failed to initialize module ${name}:`, error);
        continue;
      }

      this.moduleServices.set(name, moduleServices);
      this.modules.set(name, module);
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

  async setEnabled(moduleName: string, guildId: string, enabled: boolean): Promise<void> {
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
    const module = this.modules.get(moduleName);
    if (!module) return false;
    if (module.guildsDisabled.has(guildId)) return false;
    return module.supermodule
      ? this.isEnabled(guildId, module.supermodule)
      : true;
  }

  async reload(moduleName: string): Promise<void> {
    const module = this.modules.get(moduleName);
    if (!module) return;

    const services =
      this.moduleServices.get(moduleName) ??
      ({ ...this.services, __moduleName: moduleName } as ModuleServices);

    await module.definition.onUnload(services);

    const definition = await this.loadDefinition(module.path, module.manifest);
    if (!definition) {
      throw new Error(`Failed to reload module "${moduleName}".`);
    }

    module.definition = definition;
    await definition.onLoad(services);
  }

  async unload(name: string): Promise<LoadedModule[]> {
    const removed = this.listAll().filter(
      (module) => module.manifest.name === name || module.supermodule === name,
    );

    for (const module of removed) {
      const moduleName = module.manifest.name;
      const services = this.moduleServices.get(moduleName) ?? this.services;
      try {
        await module.definition.onUnload(services);
      } catch (error) {
        console.error(`Failed to unload module ${moduleName}:`, error);
      }
      this.modules.delete(moduleName);
      this.moduleServices.delete(moduleName);
    }

    return removed;
  }

  getModule(name: string): LoadedModule | undefined {
    return this.modules.get(name);
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
      configFields: module.manifest.configFields,
      isSubmodule: module.isSubmodule,
      supermodule: module.supermodule,
    }));
  }
}

export function createModuleLoader(): ModuleLoader {
  return new ModuleLoader();
}
