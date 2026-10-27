import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ModuleDefinition } from "@lumi/module-kit";
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

export class ModuleLoader {
  private modules = new Map<string, LoadedModule>();
  private roots: Array<{ path: string; origin: "bundled" | "addon" }> = [];
  private services: any = {};

  addRoot(path: string, origin: "bundled" | "addon"): void {
    this.roots.push({ path: resolve(path), origin });
  }

  async discover(): Promise<LoadedModule[]> {
    const discovered: LoadedModule[] = [];

    for (const root of this.roots) {
      try {
        const entries = await readdir(root.path, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const modulePath = join(root.path, entry.name);
          const manifestPath = join(modulePath, "manifest.json");

          let manifest: ModuleManifest;
          try {
            const manifestContent = await readFile(manifestPath, "utf-8");
            manifest = validateManifest(JSON.parse(manifestContent));
          } catch {
            continue;
          }

          if (manifest.apiVersion !== 2) continue;

          await this.discoverSupermodule(modulePath, manifest, root.origin, discovered);
        }
      } catch (e) {
        console.error(`Error discovering modules in ${root.path}:`, e);
      }
    }

    return discovered;
  }

  private async discoverSupermodule(
    modulePath: string,
    manifest: ModuleManifest,
    origin: "bundled" | "addon",
    discovered: LoadedModule[]
  ): Promise<void> {
    if (!manifest.entry) return;

    let superDefinition: ModuleDefinition;
    try {
      const entryPath = join(modulePath, manifest.entry);
      const mod = await import(`${entryPath}?t=${Date.now()}`);
      superDefinition = mod.default;
    } catch (e) {
      console.error(`Failed to load supermodule ${manifest.name}:`, e);
      return;
    }

    if (superDefinition.name !== manifest.name) {
      console.error(`Supermodule name mismatch: ${superDefinition.name} !== ${manifest.name}`);
      return;
    }

    const supermodule: LoadedModule = {
      manifest,
      definition: superDefinition,
      path: modulePath,
      origin,
      isSubmodule: false,
      guildsDisabled: new Set(),
    };

    discovered.push(supermodule);

    try {
      const subEntries = await readdir(modulePath, { withFileTypes: true });

      for (const subEntry of subEntries) {
        if (!subEntry.isDirectory()) continue;
        if (subEntry.name === "node_modules") continue;

        const subPath = join(modulePath, subEntry.name);
        const subManifestPath = join(subPath, "manifest.json");

        let subManifest: ModuleManifest;
        try {
          const content = await readFile(subManifestPath, "utf-8");
          subManifest = validateManifest(JSON.parse(content));
        } catch {
          continue;
        }

        if (subManifest.apiVersion !== 2) continue;
        if (!subManifest.entry) continue;
        if (!/^[a-z][a-z0-9-]*$/.test(subManifest.name)) continue;

        const entryPath = join(subPath, subManifest.entry);
        let subDefinition: ModuleDefinition;
        try {
          const mod = await import(`${entryPath}?t=${Date.now()}`);
          subDefinition = mod.default;
        } catch (e) {
          console.error(`Failed to load submodule ${subManifest.name}:`, e);
          continue;
        }

        if (subDefinition.name !== subManifest.name) {
          console.error(`Submodule name mismatch: ${subDefinition.name} !== ${subManifest.name}`);
          continue;
        }

        const submodule: LoadedModule = {
          manifest: subManifest,
          definition: subDefinition,
          path: subPath,
          origin,
          supermodule: manifest.name,
          isSubmodule: true,
          guildsDisabled: new Set(),
        };

        discovered.push(submodule);
      }
    } catch {
      // No submodules directory or empty
    }
  }

  async loadAll(discovered: LoadedModule[], services: any): Promise<LoadedModule[]> {
    this.services = services;
    const sorted = this.topologicalSort(discovered);

    for (const module of sorted) {
      if (this.modules.has(module.manifest.name)) continue;
      try {
        const conflict = sorted.find(m => module.manifest.conflicts.includes(m.manifest.name));
        if (conflict) {
          console.warn(`Module ${module.manifest.name} conflicts with ${conflict.manifest.name}, skipping`);
          continue;
        }

        for (const [depName, _depRange] of Object.entries(module.manifest.dependencies)) {
          const dep = sorted.find(m => m.manifest.name === depName);
          if (!dep) {
            console.warn(`Module ${module.manifest.name} depends on missing module ${depName}`);
          }
        }

        this.modules.set(module.manifest.name, module);

        try {
          await module.definition.onLoad({ ...services, __moduleName: module.manifest.name });
        } catch (e) {
          console.error(`Failed to initialize module ${module.manifest.name}:`, e);
        }
      } catch (e) {
        console.error(`Error loading module ${module.manifest.name}:`, e);
      }
    }

    return Array.from(this.modules.values());
  }

  private topologicalSort(modules: LoadedModule[]): LoadedModule[] {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const m of modules) {
      graph.set(m.manifest.name, new Set());
      inDegree.set(m.manifest.name, 0);
    }

    for (const m of modules) {
      for (const dep of Object.keys(m.manifest.dependencies)) {
        if (graph.has(dep)) {
          graph.get(dep)!.add(m.manifest.name);
          inDegree.set(m.manifest.name, (inDegree.get(m.manifest.name) ?? 0) + 1);
        }
      }
    }

    const queue = Array.from(inDegree.entries())
      .filter(([, deg]) => deg === 0)
      .map(([name]) => name);

    const sorted: LoadedModule[] = [];
    const moduleMap = new Map(modules.map(m => [m.manifest.name, m]));

    while (queue.length > 0) {
      const name = queue.shift()!;
      const module = moduleMap.get(name);
      if (module) sorted.push(module);

      for (const dependent of graph.get(name) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    for (const m of modules) {
      if (!sorted.includes(m)) sorted.push(m);
    }

    return sorted;
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

    await module.definition.onUnload(this.services);

    const entryPath = join(module.path, module.manifest.entry);
    delete require.cache[require.resolve(entryPath)];
    const mod = await import(`${entryPath}?t=${Date.now()}`);

    module.definition = mod.default;
    await module.definition.onLoad(this.services);
  }

  async unload(name: string): Promise<LoadedModule[]> {
    const removed = this.listAll().filter(
      (module) => module.manifest.name === name || module.supermodule === name,
    );

    for (const module of removed) {
      try {
        await module.definition.onUnload(this.services);
      } catch (error) {
        console.error(`Failed to unload module ${module.manifest.name}:`, error);
      }
      this.modules.delete(module.manifest.name);
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
    return Array.from(this.modules.values()).map(m => ({
      name: m.manifest.name,
      displayName: m.manifest.displayName,
      emoji: m.manifest.emoji,
      description: m.manifest.description,
      version: m.manifest.version,
      configFields: m.manifest.configFields ?? [],
      isSubmodule: m.isSubmodule,
      supermodule: m.supermodule,
    }));
  }
}

export function createModuleLoader(): ModuleLoader {
  return new ModuleLoader();
}
