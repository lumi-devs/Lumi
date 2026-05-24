import { Store, container } from "@sapphire/framework";
import { Module, type ModuleMeta } from "./Module.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ModuleState =
  | "discovered"
  | "loaded"
  | "failed"
  | "disabled"
  | "skipped-conflict";

export interface ModuleRecord {
  name: string;
  dir: string;
  indexUrl: string;
  enabled: boolean;
  meta: ModuleMeta;
  state?: ModuleState;
}

export class ModuleStore extends Store<Module> {
  private readonly _roots: URL[] = [];
  private _discovered = false;
  private _records = new Map<string, ModuleRecord>();
  private _invalidationListenerSet = false;

  public constructor() {
    super(Module, { name: "modules" });
  }

  public addRoot(root: URL) {
    this._roots.push(root);
  }

  public override async loadAll() {
    await this.discover();

    // Prevent the default recursive walk from scanning module root directories
    // (e.g. src/modules/), which would pick up non-Module files like data.ts,
    // listeners/*.ts, etc. and throw MissingExportsError.
    // Module discovery is handled by _walk in discover() above; super.loadAll()
    // only needs to load Module pieces from non-root paths (e.g. src/core/modules/).
    const rootPaths = this._roots.map((r) => path.resolve(fileURLToPath(r)));
    const removedPaths: string[] = [];
    for (const p of this.paths) {
      const resolvedP = path.resolve(p);
      if (
        rootPaths.some(
          (root) => resolvedP === root || resolvedP.startsWith(root + path.sep),
        )
      ) {
        removedPaths.push(p);
      }
    }
    for (const p of removedPaths) this.paths.delete(p);

    await super.loadAll();

    for (const p of removedPaths) this.paths.add(p);

    // Manually load the Module piece for each discovered feature module.
    // super.loadAll() skipped these because we removed the root paths to avoid scanning
    // non-module files.
    for (const record of this._records.values()) {
      if (record.enabled) {
        const indexPath = await this._findIndex(record.dir);
        if (indexPath) {
          await this.load(record.dir, path.basename(indexPath));
        }
      }
    }

    try {
      const stateMap = await container.db.getGlobalModuleStates();
      for (const module of this.values()) {
        if (module.isCore) {
          module.enabled = true;
          continue;
        }
        module.enabled = stateMap.get(module.name) ?? true;
      }
    } catch (err: unknown) {
      container.logger.error("[ModuleStore] DB sync failed:", err);
    }

    this._setupInvalidationListener();
  }

  public async discover(force = false) {
    if (this._discovered && !force) return;

    const globalState = await container.db.getGlobalModuleStates();
    const found = new Map<string, ModuleRecord>();

    for (const root of this._roots) {
      const rootPath = fileURLToPath(root);
      if (await this._exists(rootPath)) {
        await this._walk(rootPath, found, globalState);
      }
    }

    // Update records
    for (const [name, record] of found) {
      this._records.set(name, record);
    }

    this._applyConflicts();

    const topo = this._topoSort();
    for (const name of topo) {
      const record = this._records.get(name)!;
      if (!record.enabled) continue;

      // Use StoreRegistry.registerPath to register store-name-joined subdirectories
      // (e.g. commands/, listeners/, services/) with their respective stores.
      // This prevents non-piece files (data.ts, data/, index.ts) from being scanned
      // by every store, which would throw EMPTY_MODULE errors.
      // Pass the filesystem path (not a file: URL) so path.join produces valid paths.
      container.stores.registerPath(record.dir);
    }

    this._discovered = true;
  }

  public override async unload(nameOrPiece: string | Module): Promise<Module> {
    const name =
      typeof nameOrPiece === "string" ? nameOrPiece : nameOrPiece.name;
    const record = this._records.get(name);

    if (record) {
      // 1. Unload all pieces and DEREGISTER the store-name-joined paths
      for (const store of container.stores.values()) {
        const storePath = `${record.dir}/${store.name}`;
        store.paths?.delete(storePath);

        if (store === this) continue;

        for (const piece of [...store.values()]) {
          if (piece.location.full.startsWith(record.dir)) {
            await store.unload(piece.name);
          }
        }
      }
    }

    // 2. Unload the module piece itself from this store
    const result = await super.unload(nameOrPiece);

    // 3. Remove from records if it's no longer on disk
    if (record && !(await this._exists(record.dir))) {
      this._records.delete(name);
    }

    return result as Module;
  }

  public async setEnabled(name: string, enabled: boolean, reason?: string) {
    const module = this.get(name);
    const record = this._records.get(name);
    if (!record) throw new Error(`Unknown module: ${name}`);
    if (record.meta.isCore && !enabled) throw new Error("Cannot disable Core");

    await container.db.setModuleGlobalEnabled(name, enabled, reason);

    // Locally update state immediately
    record.enabled = enabled;
    if (module) module.enabled = enabled;

    if (enabled) {
      await this.loadModule(name);
    } else {
      await this.unload(name);
    }
  }

  public all() {
    return Array.from(this._records.values());
  }

  public getRecord(name: string) {
    return this._records.get(name);
  }

  public loaded(): ModuleRecord[] {
    return Array.from(this.values())
      .map((m) => this._records.get(m.name))
      .filter((r): r is ModuleRecord => r !== undefined);
  }

  public async loadModule(name: string) {
    const record = this._records.get(name);
    if (!record) throw new Error(`Module ${name} not found`);

    // Load pieces from the registered path
    // Note: store paths were already registered during discover()
    await container.stores.load();

    const indexPath = await this._findIndex(record.dir);
    if (indexPath) await this.load(record.dir, path.basename(indexPath));
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private _setupInvalidationListener() {
    if (this._invalidationListenerSet || !container.invalidation) return;
    this._invalidationListenerSet = true;

    container.invalidation.onInvalidate(async (keys) => {
      const prefix = "ember:module:global:enabled:";

      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length);
        const module = this.get(name);
        const record = this._records.get(name);

        if (record && !record.meta.isCore) {
          const newEnabled = await container.db.isModuleGlobalEnabled(name);
          if (record.enabled !== newEnabled) {
            record.enabled = newEnabled;
            if (module) module.enabled = newEnabled;

            // Synchronize pieces on this node
            if (newEnabled) {
              await this.loadModule(name).catch((err) =>
                container.logger.error(
                  `[ModuleStore] Cluster load failed: ${name}`,
                  err,
                ),
              );
            } else {
              await this.unload(name).catch((err) =>
                container.logger.error(
                  `[ModuleStore] Cluster unload failed: ${name}`,
                  err,
                ),
              );
            }
          }
        }
      }
    });
  }

  private async _exists(p: string) {
    return fs
      .access(p)
      .then(() => true)
      .catch(() => false);
  }

  private async _walk(
    dir: string,
    found: Map<string, ModuleRecord>,
    globalState: Map<string, boolean>,
    depth = 0,
  ) {
    const entries = await fs.readdir(dir).catch(() => []);

    for (const name of entries) {
      if (name.startsWith("_") || name.startsWith(".")) continue;
      const sub = path.join(dir, name);
      const stat = await fs.stat(sub).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const indexPath = await this._findIndex(sub);
      if (indexPath) {
        await this._ingest(sub, indexPath, found, globalState);
      }
      await this._walk(sub, found, globalState, depth + 1);
    }
  }

  private async _findIndex(dir: string) {
    for (const c of ["index.ts", "index.js", "index.mts"]) {
      const p = path.join(dir, c);
      if (await this._exists(p)) return p;
    }
    return null;
  }

  private async _ingest(
    dir: string,
    indexPath: string,
    found: Map<string, ModuleRecord>,
    globalState: Map<string, boolean>,
  ) {
    try {
      const mod = await import(pathToFileURL(indexPath).href);
      const meta =
        mod.meta ??
        mod.default?.meta ??
        (
          Object.values(mod).find(
            (v: unknown) => (v as { meta?: ModuleMeta })?.meta,
          ) as { meta?: ModuleMeta }
        )?.meta;

      if (!meta || found.has(meta.name)) return;

      found.set(meta.name, {
        name: meta.name,
        dir,
        indexUrl: pathToFileURL(indexPath).href,
        enabled: globalState.get(meta.name) ?? true,
        meta,
      });
    } catch (err: unknown) {
      container.logger.error(`[ModuleStore] Import failed: ${indexPath}`, err);
    }
  }

  private _applyConflicts() {
    for (const record of this._records.values()) {
      for (const conflict of record.meta.conflicts ?? []) {
        const other = this._records.get(conflict);
        if (other?.enabled && !other.meta.isCore) {
          container.logger.warn(
            `[ModuleStore] Disabling conflicting module: ${conflict} (conflict with ${record.name})`,
          );
          other.enabled = false;
        }
      }
    }
  }

  private _topoSort() {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) throw new Error(`Circular dependency: ${name}`);

      const record = this._records.get(name);
      if (!record) {
        container.logger.error(`[ModuleStore] Missing dependency: ${name}`);
        return;
      }

      visiting.add(name);
      for (const dep of record.meta.dependencies ?? []) {
        if (!this._records.has(dep)) {
          throw new Error(
            `Module '${name}' requires missing dependency '${dep}'`,
          );
        }
        visit(dep);
      }
      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    for (const name of this._records.keys()) visit(name);
    return order;
  }
}

declare module "@sapphire/framework" {
  interface StoreRegistryEntries {
    modules: ModuleStore;
  }
}
