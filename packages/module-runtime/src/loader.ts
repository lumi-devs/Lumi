import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ModuleDefinition } from "@lumi/module-kit";
import { ModuleManifest, validateManifest } from "./manifest.js";

export interface LoadedModule {
  manifest: ModuleManifest;
  definition: ModuleDefinition;
  path: string;
  origin: "bundled" | "addon";
  supermodule?: string;
  isSubmodule: boolean;
  enabled: boolean;
  guildsEnabled: Set<string>;
}

interface SupermoduleContext {
  name: string;
  submodules: Map<string, LoadedModule>;
}

export class ModuleLoader {
  private modules = new Map<string, LoadedModule>();
  private loadOrder: string[] = [];
  private roots: Array<{ path: string; origin: "bundled" | "addon" }> = [];
  private supermodules = new Map<string, SupermoduleContext>();

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
      const mod = await import(entryPath);
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
      enabled: true,
      guildsEnabled: new Set(),
    };

    discovered.push(supermodule);

    const submoduleMap = new Map<string, LoadedModule>();

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
          const mod = await import(entryPath);
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
          enabled: true,
          guildsEnabled: new Set(),
        };

        discovered.push(submodule);
        submoduleMap.set(subManifest.name, submodule);
      }
    } catch {
      // No submodules directory or empty
    }

    this.supermodules.set(manifest.name, {
      name: manifest.name,
      submodules: submoduleMap,
    });
  }

  async loadAll(discovered: LoadedModule[], services: any): Promise<LoadedModule[]> {
    const sorted = this.topologicalSort(discovered);

    for (const module of sorted) {
      try {
        const conflict = sorted.find(m => module.manifest.conflicts.includes(m.manifest.name));
        if (conflict) {
          console.warn(`Module ${module.manifest.name} conflicts with ${conflict.manifest.name}, skipping`);
          continue;
        }

        for (const [depName, depRange] of Object.entries(module.manifest.dependencies)) {
          const dep = sorted.find(m => m.manifest.name === depName);
          if (!dep) {
            console.warn(`Module ${module.manifest.name} depends on missing module ${depName}`);
          }
        }

        this.modules.set(module.manifest.name, module);
        this.loadOrder.push(module.manifest.name);

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
      module.guildsEnabled.add(guildId);
    } else {
      module.guildsEnabled.delete(guildId);
    }
  }

  isEnabled(guildId: string, moduleName: string): boolean {
    const module = this.modules.get(moduleName);
    if (!module) return false;
    return module.guildsEnabled.has(guildId);
  }

  async reload(moduleName: string): Promise<void> {
    const module = this.modules.get(moduleName);
    if (!module) return;

    await module.definition.onUnload({} as any);

    const entryPath = join(module.path, module.manifest.entry);
    delete require.cache[require.resolve(entryPath)];
    const mod = await import(entryPath + "?t=" + Date.now());

    module.definition = mod.default;
    await module.definition.onLoad({} as any);
  }

  getModule(name: string): LoadedModule | undefined {
    return this.modules.get(name);
  }

  listAll(): LoadedModule[] {
    return Array.from(this.modules.values());
  }

  listGlobal(): Array<{ name: string; displayName: string; emoji: string; description: string; version: string; configFields: any[]; isSubmodule: boolean; supermodule?: string }> {
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
