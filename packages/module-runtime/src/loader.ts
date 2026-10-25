import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ModuleDefinition } from "@lumi/module-kit";

export interface ModuleManifest {
  apiVersion: number;
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  entry: string;
  dependencies: Record<string, string>;
  requirements: string[];
  conflicts: string[];
  capabilities: Array<{ name: string; version: string; provides: string[] }>;
}

export interface LoadedModule {
  manifest: ModuleManifest;
  definition: ModuleDefinition;
  path: string;
  enabled: boolean;
  guildsEnabled: Set<string>;
}

export class ModuleLoader {
  private modules = new Map<string, LoadedModule>();
  private loadOrder: string[] = [];
  private roots: Array<{ path: string; origin: "bundled" | "addon" }> = [];

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
            manifest = JSON.parse(manifestContent);
          } catch {
            continue; // No manifest, skip
          }

          // Validate manifest
          if (manifest.apiVersion !== 2) continue;
          if (!manifest.entry) continue;
          if (!/^[a-z][a-z0-9-]*$/.test(manifest.name)) continue;
          if (manifest.name !== entry.name) continue;

          const entryPath = join(modulePath, manifest.entry);
          let definition: ModuleDefinition;
          try {
            const mod = await import(entryPath);
            definition = mod.default;
          } catch (e) {
            console.error(`Failed to load module ${manifest.name}:`, e);
            continue;
          }

          // Verify name matches
          if (definition.name !== manifest.name) {
            console.error(`Module name mismatch: ${definition.name} !== ${manifest.name}`);
            continue;
          }

          discovered.push({
            manifest,
            definition,
            path: modulePath,
            enabled: true,
            guildsEnabled: new Set(),
          });
        }
      } catch (e) {
        console.error(`Error discovering modules in ${root.path}:`, e);
      }
    }

    return discovered;
  }

  async loadAll(discovered: LoadedModule[], services: any): Promise<LoadedModule[]> {
    // Topological sort by dependencies
    const sorted = this.topologicalSort(discovered);
    
    for (const module of sorted) {
      try {
        // Check conflicts
        const conflict = sorted.find(m => module.manifest.conflicts.includes(m.manifest.name));
        if (conflict) {
          console.warn(`Module ${module.manifest.name} conflicts with ${conflict.manifest.name}, skipping`);
          continue;
        }

        // Check dependencies
        for (const [depName, depRange] of Object.entries(module.manifest.dependencies)) {
          const dep = sorted.find(m => m.manifest.name === depName);
          if (!dep) {
            console.warn(`Module ${module.manifest.name} depends on missing module ${depName}`);
          }
        }

        this.modules.set(module.manifest.name, module);
        this.loadOrder.push(module.manifest.name);
        
        // Call onLoad with module name for enablement checks
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

    // Add any remaining (cycles)
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
    
    // Re-import with cache busting
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

  listGlobal(): Array<{ name: string; displayName: string; emoji: string; description: string; version: string }> {
    return Array.from(this.modules.values()).map(m => ({
      name: m.manifest.name,
      displayName: m.manifest.displayName,
      emoji: m.manifest.emoji,
      description: m.manifest.description,
      version: m.manifest.version,
    }));
  }
}

export function createModuleLoader(): ModuleLoader {
  return new ModuleLoader();
}