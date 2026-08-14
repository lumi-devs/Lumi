import { Store, container, type Command } from "@sapphire/framework";
import { Module, type ModuleMeta } from "./Module.js";
import {
  metaFromManifest,
  readManifest,
  type ModuleManifest,
  type TargetService,
} from "./manifest.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BaseValidator } from "@sapphire/shapeshift";
import { withSerializedWork } from "#lib/utilities/misc.js";

/**
 * Represents the current lifecycle state of a module in the store.
 */
export type ModuleState =
  "discovered" | "loaded" | "failed" | "disabled" | "skipped-conflict";

/**
 * Represents a discovered module and its metadata within the {@link ModuleStore}.
 */
export interface ModuleRecord {
  name: string;
  dir: string;
  indexUrl: string;
  enabled: boolean;
  meta: ModuleMeta;
  /** Static manifest when discovery was manifest-driven (no code executed). */
  manifest?: ModuleManifest;
  /** Service that owns this module (workers run feature modules). */
  targetService: TargetService;
  state?: ModuleState;
  failureReason?: string;
}

/** True when `child` is `parent` itself or a path nested beneath it. */
function isPathInside(child: string | undefined | null, parent: string): boolean {
  if (!child || !parent) return false;
  return child === parent || child.startsWith(parent + path.sep);
}

/** True if the error is a missing piece error from Sapphire. */
function isMissingPieceError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("does not exist");
}

/** Resolve a module's `meta` export from a dynamically imported index module. */
function extractModuleMeta(mod: {
  meta?: ModuleMeta;
  default?: { meta?: ModuleMeta };
  [key: string]: unknown;
}): ModuleMeta | undefined {
  return mod.meta ?? mod.default?.meta;
}

/**
 * A specialized Sapphire {@link Store} that discovers, loads, and manages lifecycle events for Lumi modules.
 * This store handles dependency resolution, conflict detection, and runtime enabling/disabling of modules.
 */
export class ModuleStore extends Store<Module> {
  readonly #roots: URL[] = [];
  #discovered = false;
  #records = new Map<string, ModuleRecord>();
  #invalidationListenerSet = false;
  #guarded = new WeakSet<Command>();
  #schemaCache = new Map<string, BaseValidator<any> | undefined>();

  public constructor() {
    super(Module, { name: "modules" });
  }

  /**
   * Adds a new root URL to the store for module discovery.
   *
   * @param root - The URL of the directory to search for modules.
   */
  public addRoot(root: URL) {
    this.#roots.push(root);
  }

  /**
   * Determines whether a module was discovered outside the core modules root (i.e. it's an addon).
   *
   * @param record - The module record to check.
   * @returns `true` if the module's directory is not nested under the first registered root.
   */
  public isAddonModule(record: ModuleRecord): boolean {
    const coreRoot = this.#roots[0];
    if (!coreRoot) return false;
    const coreRootPath = path.resolve(fileURLToPath(coreRoot));
    const recordDir = path.resolve(record.dir);
    return !isPathInside(recordDir, coreRootPath);
  }

  /**
   * Discovers and loads all modules from the registered root paths, respecting global enabled states and resolving dependencies.
   */
  public override async loadAll() {
    await this.discover();

    const rootPaths = this.#roots.map((r) => path.resolve(fileURLToPath(r)));
    const removedPaths: string[] = [];
    for (const p of this.paths) {
      const resolvedP = path.resolve(p);
      if (rootPaths.some((root) => isPathInside(resolvedP, root))) {
        removedPaths.push(p);
      }
    }
    for (const p of removedPaths) this.paths.delete(p);

    await super.loadAll();

    for (const p of removedPaths) this.paths.add(p);

    for (const record of this.#records.values()) {
      if (record.enabled) {
        try {
          const indexPath = await this.#findIndex(record.dir);
          if (indexPath) await this.load(record.dir, path.basename(indexPath));
          record.state = "loaded";
        } catch (err: unknown) {
          record.state = "failed";
          record.enabled = false;
          record.failureReason =
            err instanceof Error ? err.message : String(err);
          container.logger.error(
            `[ModuleStore] Module "${record.name}" failed to load:`,
            err,
          );
        }
      }
    }

    try {
      const stateMap = await container.db.modules.getGlobalModuleStates();
      for (const module of this.values()) {
        module.enabled = stateMap.get(module.name) ?? true;
      }
    } catch (err: unknown) {
      container.logger.error("[ModuleStore] DB sync failed:", err);
    }

    this.#setupInvalidationListener();
  }

  /**
   * Discovers modules across all registered roots without fully loading them into memory, computing topological load order and conflicts.
   *
   * @param force - If true, forces rediscovery even if modules were already discovered.
   * @param bustCache - If true, bypasses the import cache for dynamic imports.
   */
  public async discover(force = false, bustCache = false) {
    if (this.#discovered && !force) return;

    const globalState = await container.db.modules.getGlobalModuleStates();
    const found = new Map<string, ModuleRecord>();

    for (const root of this.#roots) {
      const rootPath = fileURLToPath(root);
      if (await this.#exists(rootPath)) {
        await this.#walk(rootPath, found, globalState, 0, bustCache);
      }
    }

    for (const [name, record] of found) {
      this.#records.set(name, record);
    }

    if (force) {
      for (const [name, record] of this.#records) {
        if (await this.#exists(record.dir)) continue;
        this.#records.delete(name);
        this.#schemaCache.delete(name);
      }
    }

    this.#applyConflicts();

    const topo = this.#topoSort();
    for (const name of topo) {
      const record = this.#records.get(name)!;
      if (!record.enabled) continue;

      container.stores.registerPath(record.dir);
    }

    this.#discovered = true;
  }

  /**
   * Reloads a specific module dynamically by unloading and re-discovering it.
   *
   * @param name - The name of the module to reload.
   */
  public async reload(name: string) {
    return withSerializedWork(`module-store:enable:${name}`, async () => {
      try {
        await this.unload(name);
      } catch (err: unknown) {
        if (!isMissingPieceError(err)) throw err;
      }
      await this.discover(true, true);
      await this.loadModule(name);
    });
  }

  /**
   * Unloads a module and all its associated pieces (commands, listeners, etc.) from their respective stores.
   *
   * @param nameOrPiece - The name of the module, or the {@link Module} instance itself.
   * @returns The unloaded module instance.
   */
  public override async unload(nameOrPiece: string | Module): Promise<Module> {
    const name =
      typeof nameOrPiece === "string" ? nameOrPiece : nameOrPiece.name;
    const record = this.#records.get(name);

    if (record) {
      for (const store of container.stores.values()) {
        const storePath = `${record.dir}/${store.name}`;
        store.paths?.delete(storePath);

        if (store === this) continue;

        for (const piece of [...store.values()]) {
          if (this.#isInsideModule(record, piece.location.full)) {
            await store.unload(piece.name);
          }
        }
      }
    }

    const result = await super.unload(nameOrPiece);

    if (record && !(await this.#exists(record.dir))) {
      this.#records.delete(name);
      this.#schemaCache.delete(name);
    } else if (record) {
      record.enabled = false;
      record.state = "disabled";
      record.failureReason = undefined;
    }

    return result;
  }

  /**
   * Checks whether a module can be disabled.
   */
  public isModuleDisableable(name: string): boolean {
    const record = this.#records.get(name);
    return record ? record.meta.disableable !== false : true;
  }

  public async setEnabled(name: string, enabled: boolean, reason?: string) {
    return withSerializedWork(ModuleStore.#enableLockKey(name), async () => {
      const record = this.#records.get(name);
      if (!record) throw new Error(`Unknown module: ${name}`);
      if (!enabled && !this.isModuleDisableable(name)) {
        throw new Error(`Module '${name}' is essential and cannot be disabled.`);
      }
      if (record.enabled === enabled) return;

      if (enabled) {
        await this.loadModule(name);
      } else {
        await this.unload(name).catch((err: unknown) => {
          if (!isMissingPieceError(err)) throw err;
        });
      }

      await container.db.modules.setModuleGlobalEnabled(name, enabled, reason);

      record.enabled = enabled;
      record.state = enabled ? "loaded" : "disabled";
      record.failureReason = undefined;
      const module = this.get(name);
      if (module) module.enabled = enabled;
    });
  }

  static #enableLockKey(name: string): string {
    return `module-store:enable:${name}`;
  }

  /**
   * Retrieves all module records currently tracked by the store.
   *
   * @returns An array of {@link ModuleRecord} instances.
   */
  public all() {
    return Array.from(this.#records.values());
  }

  /**
   * Retrieves a specific module record by name.
   *
   * @param name - The name of the module to retrieve.
   * @returns The {@link ModuleRecord} if found, otherwise `undefined`.
   */
  public getRecord(name: string) {
    return this.#records.get(name);
  }

  /** Resolves which module owns a given piece location (absolute path). */
  public moduleNameForLocation(fullPath: string): string | null {
    let best: ModuleRecord | null = null;
    for (const record of this.#records.values()) {
      if (this.#isInsideModule(record, fullPath)) {
        if (!best || record.dir.length > best.dir.length) best = record;
      }
    }
    return best?.name ?? null;
  }

  /** Ensures commands belonging to a module carry the `ModuleEnabled` precondition. */
  public attachModuleGuards() {
    const commands = container.stores.get("commands");
    for (const command of commands.values()) {
      if (this.#guarded.has(command)) continue;
      const moduleName = this.moduleNameForLocation(command.location.full);
      if (!moduleName) continue;

      const declared = command.options.preconditions;
      const alreadyDeclared =
        Array.isArray(declared) &&
        declared.some(
          (p) =>
            p === "ModuleEnabled" ||
            (typeof p === "object" &&
              p !== null &&
              "name" in p &&
              p.name === "ModuleEnabled"),
        );
      if (!alreadyDeclared) command.preconditions.append("ModuleEnabled");
      this.#guarded.add(command);
    }
  }

  /**
   * Retrieves all fully loaded module records.
   *
   * @returns An array of {@link ModuleRecord} instances representing loaded modules.
   */
  public loaded(): ModuleRecord[] {
    return Array.from(this.values())
      .map((m) => this.#records.get(m.name))
      .filter((r): r is ModuleRecord => r !== undefined);
  }

  /** Every module's entry file is `index.ts`; rename the piece to its declared module name so Sapphire's name-collision eviction in `insert()` doesn't unload one module per subsequent module load. */
  public override construct(
    ...args: Parameters<Store<Module>["construct"]>
  ): Module {
    const [Ctor, data] = args;
    const record = [...this.#records.values()].find(
      (r) => r.dir === data.root,
    );
    return super.construct(Ctor, record ? { ...data, name: record.name } : data);
  }

  /**
   * Loads a module and sequentially loads all of its child pieces across all registered Sapphire stores.
   *
   * @param name - The name of the module to load.
   */
  public async loadModule(name: string) {
    const record = this.#records.get(name);
    if (!record) throw new Error(`Module ${name} not found`);
    const failures: Error[] = [];

    for (const store of container.stores.values()) {
      if (store === this) continue;
      const storePath = path.join(record.dir, store.name);
      if (!(await this.#exists(storePath))) continue;

      const files = await this.#walkStoreFiles(storePath);
      for (const file of files) {
        try {
          await store.load(storePath, file);
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          failures.push(error);
          container.logger.error(
            `[ModuleStore] Failed to load piece ${file} for module ${name}:`,
            err,
          );
        }
      }
    }

    const indexPath = await this.#findIndex(record.dir);
    try {
      if (indexPath) await this.load(record.dir, path.basename(indexPath));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      failures.push(error);
      container.logger.error(
        `[ModuleStore] Failed to load module index for ${name}:`,
        err,
      );
    }

    if (failures.length > 0) {
      const failureReason = failures.map((err) => err.message).join("; ");
      await this.unload(name).catch(() => undefined);
      record.enabled = false;
      record.state = "failed";
      record.failureReason = failureReason;
      throw new Error(`Module ${name} failed to load: ${record.failureReason}`);
    }

    this.attachModuleGuards();
    record.enabled = true;
    record.state = "loaded";
    record.failureReason = undefined;
  }

  /**
   * Retrieves the configuration schema for a specific module, extracting it from the module's meta export.
   *
   * @param name - The name of the module.
   * @returns The shape validation schema, or `undefined` if none is defined.
   */
  public async getConfigSchema(
    name: string,
  ): Promise<BaseValidator<any> | undefined> {
    if (this.#schemaCache.has(name)) return this.#schemaCache.get(name);

    const record = this.#records.get(name);
    if (!record) return undefined;
    if (record.meta.configSchema) {
      this.#schemaCache.set(name, record.meta.configSchema);
      return record.meta.configSchema;
    }

    try {
      const mod = await import(record.indexUrl);
      const meta = extractModuleMeta(mod);
      this.#schemaCache.set(name, meta?.configSchema);
      return meta?.configSchema;
    } catch (err: unknown) {
      container.logger.error(
        `[ModuleStore] Failed to load configSchema for ${name}:`,
        err,
      );
      return undefined;
    }
  }

  #setupInvalidationListener() {
    if (this.#invalidationListenerSet || !container.invalidation) return;
    this.#invalidationListenerSet = true;

    const prefix = "lumi:module:global:enabled:";

    container.invalidation.onInvalidate(async (keys) => {
      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        await this.#syncModuleEnabled(key.slice(prefix.length));
      }
    });

    container.invalidation.onResync(async () => {
      await Promise.all(
        [...this.#records.keys()].map((name) => this.#syncModuleEnabled(name)),
      );
    });
  }

  async #syncModuleEnabled(name: string): Promise<void> {
    return withSerializedWork(ModuleStore.#enableLockKey(name), async () => {
      const module = this.get(name);
      const record = this.#records.get(name);
      if (!record) return;

      const newEnabled = await container.db.modules.isModuleGlobalEnabled(name);
      if (record.enabled === newEnabled) return;

      record.enabled = newEnabled;
      if (module) module.enabled = newEnabled;

      if (newEnabled) {
        await this.loadModule(name).catch((err) =>
          container.logger.error(`[ModuleStore] Cluster load failed: ${name}`, err),
        );
      } else {
        await this.unload(name).catch((err) =>
          container.logger.error(`[ModuleStore] Cluster unload failed: ${name}`, err),
        );
      }
    });
  }

  async #walkStoreFiles(dir: string, baseDir = dir): Promise<string[]> {
    const out: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await this.#walkStoreFiles(full, baseDir)));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") ||
          entry.name.endsWith(".js") ||
          entry.name.endsWith(".mts")) &&
        !entry.name.endsWith(".d.ts")
      ) {
        out.push(path.relative(baseDir, full));
      }
    }
    return out;
  }

  async #exists(p: string) {
    return fs
      .access(p)
      .then(() => true)
      .catch(() => false);
  }

  #isInsideModule(record: ModuleRecord, fullPath: string): boolean {
    return isPathInside(fullPath, record.dir);
  }

  async #walk(
    dir: string,
    found: Map<string, ModuleRecord>,
    globalState: Map<string, boolean>,
    depth = 0,
    bustCache = false,
  ) {
    const entries = await fs.readdir(dir).catch(() => []);

    for (const name of entries) {
      if (
        name.startsWith("_") ||
        name.startsWith(".") ||
        name === "node_modules" ||
        name === "scripts" ||
        name === "dist"
      )
        continue;
      const sub = path.join(dir, name);
      const stat = await fs.stat(sub).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const indexPath = await this.#findIndex(sub);
      const manifest = await readManifest(sub);

      if (manifest) {
        const effectiveIndex = indexPath || path.join(sub, "manifest.json");
        this.#ingestManifest(sub, effectiveIndex, manifest, found, globalState);
      } else if (indexPath) {
        await this.#ingest(sub, indexPath, found, globalState, bustCache);
      }
      await this.#walk(sub, found, globalState, depth + 1, bustCache);
    }
  }

  async #findIndex(dir: string) {
    for (const c of ["index.ts", "index.js", "index.mts"]) {
      const p = path.join(dir, c);
      if (await this.#exists(p)) return p;
    }
    return null;
  }

  #buildRecord(
    name: string,
    dir: string,
    indexPath: string,
    meta: ModuleMeta,
    globalState: Map<string, boolean>,
    targetService: TargetService,
    manifest?: ModuleManifest,
  ): ModuleRecord {
    return {
      name,
      dir,
      indexUrl: pathToFileURL(indexPath).href,
      enabled: globalState.get(name) ?? true,
      meta,
      ...(manifest ? { manifest } : {}),
      targetService,
    };
  }

  #ingestManifest(
    dir: string,
    indexPath: string,
    manifest: ModuleManifest,
    found: Map<string, ModuleRecord>,
    globalState: Map<string, boolean>,
  ) {
    if (found.has(manifest.name)) return;
    found.set(
      manifest.name,
      this.#buildRecord(
        manifest.name,
        dir,
        indexPath,
        metaFromManifest(manifest),
        globalState,
        manifest.targetService,
        manifest,
      ),
    );
  }

  async #ingest(
    dir: string,
    indexPath: string,
    found: Map<string, ModuleRecord>,
    globalState: Map<string, boolean>,
    bustCache = false,
  ) {
    try {
      const baseUrl = pathToFileURL(indexPath).href;
      const importUrl = bustCache ? `${baseUrl}?t=${Date.now()}` : baseUrl;
      const mod = await import(importUrl);
      const meta = extractModuleMeta(mod);

      if (!meta || found.has(meta.name)) return;

      if (meta.configSchema)
        this.#schemaCache.set(meta.name, meta.configSchema);

      found.set(
        meta.name,
        this.#buildRecord(meta.name, dir, indexPath, meta, globalState, "worker"),
      );
    } catch (err: unknown) {
      container.logger.error(`[ModuleStore] Import failed: ${indexPath}`, err);
    }
  }

  #applyConflicts() {
    for (const record of this.#records.values()) {
      for (const conflict of record.meta.conflicts ?? []) {
        const other = this.#records.get(conflict);
        if (other?.enabled) {
          container.logger.warn(
            `[ModuleStore] Disabling conflicting module: ${conflict} (conflict with ${record.name})`,
          );
          other.enabled = false;
        }
      }
    }
  }

  #disableBrokenModule(name: string, reason: string, broken: Set<string>) {
    const record = this.#records.get(name);
    if (record && record.enabled) {
      record.enabled = false;
      record.state = "failed";
      record.failureReason = reason;
      container.logger.error(`[ModuleStore] Disabling module "${name}": ${reason}`);
    }
    broken.add(name);
  }

  #topoSort() {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const broken = new Set<string>();

    const visit = (name: string): boolean => {
      if (visited.has(name)) return !broken.has(name);
      if (broken.has(name)) return false;

      if (visiting.has(name)) {
        this.#disableBrokenModule(
          name,
          `Circular dependency detected involving '${name}'`,
          broken,
        );
        return false;
      }

      const record = this.#records.get(name);
      if (!record) {
        container.logger.error(`[ModuleStore] Missing dependency: ${name}`);
        broken.add(name);
        return false;
      }

      if (!record.enabled) {
        visited.add(name);
        order.push(name);
        return true;
      }

      visiting.add(name);
      for (const dep of record.meta.dependencies ?? []) {
        if (!this.#records.has(dep)) {
          visiting.delete(name);
          this.#disableBrokenModule(
            name,
            `Module '${name}' requires missing dependency '${dep}'`,
            broken,
          );
          return false;
        }
        if (!visit(dep)) {
          visiting.delete(name);
          this.#disableBrokenModule(
            name,
            `Module '${name}' disabled because its dependency '${dep}' is unavailable`,
            broken,
          );
          return false;
        }
      }
      visiting.delete(name);
      visited.add(name);
      order.push(name);
      return true;
    };

    for (const name of this.#records.keys()) visit(name);
    return order;
  }
}

declare module "@sapphire/framework" {
  interface StoreRegistryEntries {
    modules: ModuleStore;
  }
}
