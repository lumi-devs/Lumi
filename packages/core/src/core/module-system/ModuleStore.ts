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
import type { z } from "zod";

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
  /** Static manifest when discovery was manifest-driven (no code executed). */
  manifest?: ModuleManifest;
  /** Service that owns this module (workers run feature modules). */
  targetService: TargetService;
  state?: ModuleState;
  failureReason?: string;
}

export class ModuleStore extends Store<Module> {
  readonly #roots: URL[] = [];
  #discovered = false;
  #records = new Map<string, ModuleRecord>();
  #invalidationListenerSet = false;
  #guarded = new WeakSet<Command>();
  #schemaCache = new Map<string, z.ZodObject<z.ZodRawShape> | undefined>();

  public constructor() {
    super(Module, { name: "modules" });
  }

  public addRoot(root: URL) {
    this.#roots.push(root);
  }

  public override async loadAll() {
    await this.discover();

    // Prevent the default recursive walk from scanning module root directories
    // (e.g. src/modules/), which would pick up non-Module files like data.ts,
    // listeners/*.ts, etc. and throw MissingExportsError.
    const rootPaths = this.#roots.map((r) => path.resolve(fileURLToPath(r)));
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
        if (module.isCore) {
          module.enabled = true;
          continue;
        }
        module.enabled = stateMap.get(module.name) ?? true;
      }
    } catch (err: unknown) {
      container.logger.error("[ModuleStore] DB sync failed:", err);
    }

    this.#setupInvalidationListener();
  }

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
   * Unload a module, re-discover it (with ESM cache-busting so code changes
   * on disk are picked up), then re-load it. Used by `,module reload` and the
   * downloader update flow.
   */
  public async reload(name: string) {
    const record = this.#records.get(name);
    if (record?.meta.isCore)
      throw new Error(`Cannot reload core module "${name}"`);

    // Tolerate a module that is recorded but not currently loaded as a store
    // piece — e.g. it failed to load at boot, or its files were restored after
    // a container wipe. We still want to re-discover + load it fresh, so a
    // missing piece must not abort the reload (mirrors uninstallModule).
    try {
      await this.unload(name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("does not exist")) throw err;
    }
    // bustCache=true appends ?t=<timestamp> to index imports so Bun/Node ESM
    // treats them as new URLs and re-evaluates updated source on disk.
    await this.discover(true, true);
    await this.loadModule(name);
  }

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
          if (piece.location.full.startsWith(record.dir)) {
            await store.unload(piece.name);
          }
        }
      }
    }

    const result = await super.unload(nameOrPiece);

    if (record && !(await this.#exists(record.dir))) {
      this.#records.delete(name);
    }

    return result as Module;
  }

  public async setEnabled(name: string, enabled: boolean, reason?: string) {
    const record = this.#records.get(name);
    if (!record) throw new Error(`Unknown module: ${name}`);
    if (record.meta.isCore && !enabled) throw new Error("Cannot disable Core");
    if (record.enabled === enabled) return; // already in desired state

    await container.db.modules.setModuleGlobalEnabled(name, enabled, reason);

    record.enabled = enabled;
    const module = this.get(name);
    if (module) module.enabled = enabled;

    if (enabled) {
      await this.loadModule(name);
    } else {
      await this.unload(name);
    }
  }

  public all() {
    return Array.from(this.#records.values());
  }

  public getRecord(name: string) {
    return this.#records.get(name);
  }

  /**
   * Resolves which module owns a given piece location (absolute path). Uses the
   * longest matching module directory so nested modules win over their parent.
   */
  public moduleNameForLocation(fullPath: string): string | null {
    let best: ModuleRecord | null = null;
    for (const record of this.#records.values()) {
      if (
        fullPath === record.dir ||
        fullPath.startsWith(record.dir + path.sep)
      ) {
        if (!best || record.dir.length > best.dir.length) best = record;
      }
    }
    return best?.name ?? null;
  }

  /**
   * Ensures every command that belongs to a module carries the `ModuleEnabled`
   * precondition, so disabling a module also gates its commands — even for
   * downloaded addons that never declared it. Idempotent and safe to re-run.
   */
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

  public loaded(): ModuleRecord[] {
    return Array.from(this.values())
      .map((m) => this.#records.get(m.name))
      .filter((r): r is ModuleRecord => r !== undefined);
  }

  public async loadModule(name: string) {
    const record = this.#records.get(name);
    if (!record) throw new Error(`Module ${name} not found`);

    for (const store of container.stores.values()) {
      if (store === this) continue;
      const storePath = path.join(record.dir, store.name);
      if (!(await this.#exists(storePath))) continue;

      const entries = await fs.readdir(storePath).catch(() => [] as string[]);
      for (const file of entries) {
        if (
          !file.endsWith(".ts") &&
          !file.endsWith(".js") &&
          !file.endsWith(".mts")
        )
          continue;
        await store
          .load(storePath, file)
          .catch((err: unknown) =>
            container.logger.error(
              `[ModuleStore] Failed to load piece ${file} for module ${name}:`,
              err,
            ),
          );
      }
    }

    const indexPath = await this.#findIndex(record.dir);
    if (indexPath) await this.load(record.dir, path.basename(indexPath));

    this.attachModuleGuards();
  }

  /**
   * Resolve a module's Zod `configSchema` for write-time validation. Manifest-
   * driven discovery never imports module code, so the schema is loaded lazily
   * (and cached) the first time a config write needs it.
   */
  public async getConfigSchema(
    name: string,
  ): Promise<z.ZodObject<z.ZodRawShape> | undefined> {
    if (this.#schemaCache.has(name)) return this.#schemaCache.get(name);

    const record = this.#records.get(name);
    if (!record) return undefined;
    if (record.meta.configSchema) {
      this.#schemaCache.set(name, record.meta.configSchema);
      return record.meta.configSchema;
    }

    try {
      const mod = await import(record.indexUrl);
      const meta: ModuleMeta | undefined =
        mod.meta ??
        mod.default?.meta ??
        (
          Object.values(mod).find(
            (v: unknown) => (v as { meta?: ModuleMeta })?.meta,
          ) as { meta?: ModuleMeta }
        )?.meta;
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

  // ── Internals ─────────────────────────────────────────────────────────

  #setupInvalidationListener() {
    if (this.#invalidationListenerSet || !container.invalidation) return;
    this.#invalidationListenerSet = true;

    container.invalidation.onInvalidate(async (keys) => {
      const prefix = "lumi:module:global:enabled:";

      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length);
        const module = this.get(name);
        const record = this.#records.get(name);

        if (record && !record.meta.isCore) {
          const newEnabled =
            await container.db.modules.isModuleGlobalEnabled(name);
          if (record.enabled !== newEnabled) {
            record.enabled = newEnabled;
            if (module) module.enabled = newEnabled;

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

  async #exists(p: string) {
    return fs
      .access(p)
      .then(() => true)
      .catch(() => false);
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
      if (name.startsWith("_") || name.startsWith(".")) continue;
      const sub = path.join(dir, name);
      const stat = await fs.stat(sub).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const indexPath = await this.#findIndex(sub);
      if (indexPath) {
        const manifest = await readManifest(sub);
        if (manifest) {
          this.#ingestManifest(sub, indexPath, manifest, found, globalState);
        } else {
          // Fallback for modules/addons without a generated manifest: import the
          // index to read its in-code `meta`. This is the only discovery-time
          // code execution and is avoided entirely once a manifest exists.
          await this.#ingest(sub, indexPath, found, globalState, bustCache);
        }
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

  #ingestManifest(
    dir: string,
    indexPath: string,
    manifest: ModuleManifest,
    found: Map<string, ModuleRecord>,
    globalState: Map<string, boolean>,
  ) {
    if (found.has(manifest.name)) return;
    found.set(manifest.name, {
      name: manifest.name,
      dir,
      indexUrl: pathToFileURL(indexPath).href,
      enabled: globalState.get(manifest.name) ?? true,
      meta: metaFromManifest(manifest),
      manifest,
      targetService: manifest.targetService,
    });
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
      // Append a timestamp query param to force ESM cache bypass on reload,
      // so file changes on disk (dev edits, git-pulled addon updates) take effect.
      const importUrl = bustCache ? `${baseUrl}?t=${Date.now()}` : baseUrl;
      const mod = await import(importUrl);
      const meta =
        mod.meta ??
        mod.default?.meta ??
        (
          Object.values(mod).find(
            (v: unknown) => (v as { meta?: ModuleMeta })?.meta,
          ) as { meta?: ModuleMeta }
        )?.meta;

      if (!meta || found.has(meta.name)) return;

      // Fallback path imported the index, so the live Zod schema is in hand —
      // cache it so `getConfigSchema` never needs a second import.
      if (meta.configSchema)
        this.#schemaCache.set(meta.name, meta.configSchema);

      found.set(meta.name, {
        name: meta.name,
        dir,
        indexUrl: pathToFileURL(indexPath).href,
        enabled: globalState.get(meta.name) ?? true,
        meta,
        targetService: "worker",
      });
    } catch (err: unknown) {
      container.logger.error(`[ModuleStore] Import failed: ${indexPath}`, err);
    }
  }

  #applyConflicts() {
    for (const record of this.#records.values()) {
      for (const conflict of record.meta.conflicts ?? []) {
        const other = this.#records.get(conflict);
        if (other?.enabled && !other.meta.isCore) {
          container.logger.warn(
            `[ModuleStore] Disabling conflicting module: ${conflict} (conflict with ${record.name})`,
          );
          other.enabled = false;
        }
      }
    }
  }

  #topoSort() {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) throw new Error(`Circular dependency: ${name}`);

      const record = this.#records.get(name);
      if (!record) {
        container.logger.error(`[ModuleStore] Missing dependency: ${name}`);
        return;
      }

      // Skip dependency traversal for disabled modules — their deps may not be
      // present, and there is nothing to order if the module won't be loaded.
      if (!record.enabled) {
        visited.add(name);
        order.push(name);
        return;
      }

      visiting.add(name);
      for (const dep of record.meta.dependencies ?? []) {
        if (!this.#records.has(dep)) {
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

    for (const name of this.#records.keys()) visit(name);
    return order;
  }
}

declare module "@sapphire/framework" {
  interface StoreRegistryEntries {
    modules: ModuleStore;
  }
}
