import type { Container } from "#lib/services.js";
import type { ModuleObject } from "./Module.js";
import type { ModuleMeta } from "./meta.js";
import {
  metaFromManifest,
  readManifest,
  type ModuleManifest,
  type TargetUtility,
} from "./manifest.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ZodType } from "zod";
import {
  isDependencySatisfied,
  parseDependencySpec,
} from "./dependencies.js";
import { withSerializedWork } from "#lib/utilities/misc.js";
import { AddonHost } from "#lib/addon-sandbox/AddonHost.js";
import {
  registerProxyCommands,
  unregisterProxyCommands,
} from "#lib/addon-sandbox/proxy-command.js";
import { createProxyModule } from "#lib/addon-sandbox/proxy-module.js";
import { registerAddonInteractionRouting } from "#lib/addon-sandbox/interaction-router.js";
import { attachListeners } from "#lib/listeners/listener-loader.js";
import { loadInteractionHandlers } from "#lib/interactions/interaction-dispatch.js";
import { commandRegistry, loadCommandDefs } from "#lib/commands/command-def.js";
import { AddonRelayTaskName } from "#lib/addon-sandbox/relay-task.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import {
  loadUtilities,
  unloadUtilitiesForDir,
} from "./Utility.js";

type ModuleState =
  "discovered" | "loaded" | "failed" | "disabled" | "skipped-conflict";

export interface ModuleRecord {
  name: string;
  dir: string;
  indexUrl: string;
  enabled: boolean;
  meta: ModuleMeta;
  manifest?: ModuleManifest;
  targetUtility: TargetUtility;
  state?: ModuleState;
  failureReason?: string;
}

function isPathInside(child: string | undefined | null, parent: string): boolean {
  if (!child || !parent) return false;
  return child === parent || child.startsWith(parent + path.sep);
}

type ModuleDef = Omit<ModuleObject, "dir"> & { dir?: string };

function findModuleDef(
  mod: Record<string, unknown>,
  name?: string,
): ModuleDef | undefined {
  const candidates = [mod.default, ...Object.values(mod)];
  for (const v of candidates) {
    if (typeof v === "function") continue;
    if (typeof v !== "object" || v === null) continue;
    const def = v as ModuleDef & { __lumiModule?: unknown };
    if (def.__lumiModule !== true) continue;
    if (name !== undefined && def.name && def.name !== name) continue;
    if (!def.name && name === undefined) continue;
    return def;
  }
  return undefined;
}

export class ModuleStore {
  readonly #services: Container;
  readonly #roots: URL[] = [];
  #discovered = false;
  #records = new Map<string, ModuleRecord>();
  #modules = new Map<string, ModuleObject>();
  #invalidationListenerSet = false;
  #schemaCache = new Map<string, ZodType<any> | undefined>();
  readonly #addons = new AddonHost();
  #addonRoutingReady = false;
  #loaderDetach = new Map<string, Array<() => void>>();

  public constructor(services: Container) {
    this.#services = services;
  }

  public addRoot(root: URL) {
    this.#roots.push(root);
  }

  public get(name: string): ModuleObject | undefined {
    return this.#modules.get(name);
  }

  public values(): IterableIterator<ModuleObject> {
    return this.#modules.values();
  }

  public get size(): number {
    return this.#modules.size;
  }

  public isAddonModule(record: ModuleRecord): boolean {
    return this.#isAddonPath(record.dir);
  }

  #isAddonPath(dir: string): boolean {
    const coreRoot = this.#roots[0];
    if (!coreRoot) return false;
    return !isPathInside(path.resolve(dir), path.resolve(fileURLToPath(coreRoot)));
  }

  public stopAddonProcesses(): void {
    this.#addons.stopAll();
  }

  public async discover(force = false, bustCache = false) {
    if (this.#discovered && !force) return;

    const globalState = await this.#services.db.modules.getGlobalModuleStates();
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
    this.#topoSort();

    this.#discovered = true;
    this.#setupInvalidationListener();
  }

  public async reload(name: string) {
    return withSerializedWork(`module-store:enable:${name}`, async () => {
      await this.unload(name).catch(() => undefined);
      await this.discover(true, true);
      await this.loadModule(name, true);
    });
  }

  public async unload(nameOrPiece: string | ModuleObject): Promise<ModuleObject | undefined> {
    const name =
      typeof nameOrPiece === "string" ? nameOrPiece : nameOrPiece.name;
    const record = this.#records.get(name);

    if (record && this.isAddonModule(record)) {
      this.#addons.stop(name);
      unregisterProxyCommands(record.dir);
    }

    if (record) {
      this.detachModuleLoaders(record.dir);
      await unloadUtilitiesForDir(record.dir).catch(() => undefined);
      for (const def of commandRegistry.values()) {
        if (def.module === name) await def.onUnload?.();
      }
    }

    const module = this.#modules.get(name);
    if (module) {
      await module.onUnload?.(this.#services);
      this.#modules.delete(name);
    }

    if (record && !(await this.#exists(record.dir))) {
      this.#records.delete(name);
      this.#schemaCache.delete(name);
    } else if (record) {
      record.enabled = false;
      record.state = "disabled";
      record.failureReason = undefined;
    }

    return module;
  }

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
        await this.loadModule(name, true);
      } else {
        await this.unload(name).catch(() => undefined);
      }

      await this.#services.db.modules.setModuleGlobalEnabled(name, enabled, reason);

      record.enabled = enabled;
      record.state = enabled ? "loaded" : "disabled";
      record.failureReason = undefined;
      const module = this.get(name);
      if (module) module.enabled = enabled;

      if (!enabled) {
        for (const dependent of this.#records.values()) {
          if (
            dependent.enabled &&
            dependent.meta.dependencies?.some(
              (dep) => parseDependencySpec(dep).name === name,
            )
          ) {
            await this.setEnabled(
              dependent.name,
              false,
              `Depends on disabled module '${name}'`,
            );
          }
        }
      }
    });
  }

  static #enableLockKey(name: string): string {
    return `module-store:enable:${name}`;
  }

  public all() {
    return Array.from(this.#records.values());
  }

  public getRecord(name: string) {
    return this.#records.get(name);
  }

  public moduleNameForLocation(fullPath: string): string | null {
    let best: ModuleRecord | null = null;
    for (const record of this.#records.values()) {
      if (this.#isInsideModule(record, fullPath)) {
        if (!best || record.dir.length > best.dir.length) best = record;
      }
    }
    return best?.name ?? null;
  }

  public loaded(): ModuleRecord[] {
    return Array.from(this.#modules.values())
      .map((m) => this.#records.get(m.name))
      .filter((r): r is ModuleRecord => r !== undefined);
  }

  public async attachModuleLoaders(record: ModuleRecord): Promise<void> {
    this.detachModuleLoaders(record.dir);
    this.#loaderDetach.set(record.dir, [
      await attachListeners(this.#services, this.#services.client, record.dir),
    ]);
    await loadInteractionHandlers(record.dir);
    await loadCommandDefs(record.dir);
    await loadUtilities(record.dir);
  }

  public detachModuleLoaders(dir: string): void {
    const fns = this.#loaderDetach.get(dir) ?? [];
    this.#loaderDetach.delete(dir);
    for (const fn of fns) fn();
  }

  public async loadModule(name: string, fresh = false): Promise<void> {
    const record = this.#records.get(name);
    if (!record) throw new Error(`Module ${name} not found`);

    if (this.isAddonModule(record)) return this.#loadAddon(record);

    try {
      await this.#loadIndex(record, fresh);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      this.#services.logger.error(
        `[ModuleStore] Failed to load module index for ${name}:`,
        err,
      );
      await this.unload(name).catch(() => undefined);
      record.enabled = false;
      record.state = "failed";
      record.failureReason = reason;
      throw new Error(`Module ${name} failed to load: ${record.failureReason}`);
    }

    await this.attachModuleLoaders(record);
    record.enabled = true;
    record.state = "loaded";
    record.failureReason = undefined;
  }

  async #loadIndex(record: ModuleRecord, fresh = false): Promise<void> {
    const baseUrl = record.indexUrl;
    const importUrl = fresh ? `${baseUrl}?t=${Date.now()}` : baseUrl;
    const mod = (await import(importUrl)) as Record<string, unknown>;
    const found = findModuleDef(mod, record.name);
    if (!found)
      throw new Error(`No module definition export found in ${record.indexUrl}`);
    const def = { ...found, name: found.name ?? record.name };
    const module: ModuleObject = { ...def, dir: record.dir };
    await module.onLoad?.(this.#services);
    this.#modules.set(record.name, module);
    if (def.meta) record.meta = def.meta;
    const schema = def.meta?.configSchema ?? def.configSchema;
    if (schema) {
      this.#schemaCache.set(record.name, schema);
    }
  }

  #ensureAddonRouting() {
    if (this.#addonRoutingReady) return;
    this.#addonRoutingReady = true;

    this.#addons.onRespawn = (record, commands) =>
      registerProxyCommands(this.#addons, record.name, record.dir, commands);
    this.#addons.onFailed = (record) => unregisterProxyCommands(record.dir);

    registerAddonInteractionRouting(this.#addons);

    registerTaskFireHandler(AddonRelayTaskName, "unicast", async (_services, payload) => {
      await this.#addons.fireTask(payload.addon, payload.task, payload.payload);
    });
  }

  async #loadAddon(record: ModuleRecord) {
    this.#ensureAddonRouting();
    try {
      const commands = await this.#addons.start(record);
      registerProxyCommands(this.#addons, record.name, record.dir, commands);
      const module = createProxyModule(record.name, record.dir, record.meta);
      await module.onLoad?.(this.#services);
      this.#modules.set(record.name, module);
      record.enabled = true;
      record.state = "loaded";
      record.failureReason = undefined;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      unregisterProxyCommands(record.dir);
      record.enabled = false;
      record.state = "failed";
      record.failureReason = reason;
      throw new Error(`Module ${record.name} failed to load: ${reason}`);
    }
  }

  public async getConfigSchema(
    name: string,
  ): Promise<ZodType<any> | undefined> {
    if (this.#schemaCache.has(name)) return this.#schemaCache.get(name);

    const record = this.#records.get(name);
    if (!record) return undefined;
    if (record.meta.configSchema) {
      this.#schemaCache.set(name, record.meta.configSchema);
      return record.meta.configSchema;
    }

    if (this.isAddonModule(record)) return undefined;

    try {
      const mod = (await import(record.indexUrl)) as Record<string, unknown>;
      const meta = findModuleDef(mod, name)?.meta;
      this.#schemaCache.set(name, meta?.configSchema);
      return meta?.configSchema;
    } catch (err: unknown) {
      this.#services.logger.error(
        `[ModuleStore] Failed to load configSchema for ${name}:`,
        err,
      );
      return undefined;
    }
  }

  #setupInvalidationListener() {
    if (this.#invalidationListenerSet || !this.#services.invalidation) return;
    this.#invalidationListenerSet = true;

    const prefix = "lumi:module:global:enabled:";

    this.#services.invalidation.onInvalidate(async (keys) => {
      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        await this.#syncModuleEnabled(key.slice(prefix.length));
      }
    });

    this.#services.invalidation.onResync(async () => {
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

      const newEnabled = await this.#services.db.modules.isModuleGlobalEnabled(name);
      if (record.enabled === newEnabled) return;

      record.enabled = newEnabled;
      if (module) module.enabled = newEnabled;

      if (newEnabled) {
        await this.loadModule(name, true).catch((err) =>
          this.#services.logger.error(`[ModuleStore] Cluster load failed: ${name}`, err),
        );
      } else {
        await this.unload(name).catch((err) =>
          this.#services.logger.error(`[ModuleStore] Cluster unload failed: ${name}`, err),
        );
      }
    });
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
      } else if (indexPath && this.#isAddonPath(sub)) {
        this.#services.logger.warn(
          `[ModuleStore] Ignoring addon without a manifest.json: ${sub}`,
        );
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
    targetUtility: TargetUtility,
    manifest?: ModuleManifest,
  ): ModuleRecord {
    return {
      name,
      dir,
      indexUrl: pathToFileURL(indexPath).href,
      enabled: globalState.get(name) ?? true,
      meta,
      ...(manifest ? { manifest } : {}),
      targetUtility,
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
        manifest.targetUtility,
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
      const mod = (await import(importUrl)) as Record<string, unknown>;
      const meta = findModuleDef(mod)?.meta;

      if (!meta) return;
      const name = meta.name ?? path.basename(dir);
      if (found.has(name)) return;

      if (meta.configSchema)
        this.#schemaCache.set(name, meta.configSchema);

      found.set(
        name,
        this.#buildRecord(name, dir, indexPath, { ...meta, name }, globalState, "worker"),
      );
    } catch (err: unknown) {
      this.#services.logger.error(`[ModuleStore] Import failed: ${indexPath}`, err);
    }
  }

  #applyConflicts() {
    for (const record of this.#records.values()) {
      for (const conflict of record.meta.conflicts ?? []) {
        const other = this.#records.get(conflict);
        if (other?.enabled) {
          this.#services.logger.warn(
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
      this.#services.logger.error(`[ModuleStore] Disabling module "${name}": ${reason}`);
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
        this.#services.logger.error(`[ModuleStore] Missing dependency: ${name}`);
        broken.add(name);
        return false;
      }

      if (!record.enabled) {
        visited.add(name);
        broken.add(name);
        return false;
      }

      visiting.add(name);
      for (const dep of record.meta.dependencies ?? []) {
        const { name: depName, range } = parseDependencySpec(dep);
        const depRecord = this.#records.get(depName);
        if (!depRecord) {
          visiting.delete(name);
          this.#disableBrokenModule(
            name,
            `Module '${name}' requires missing dependency '${depName}'`,
            broken,
          );
          return false;
        }
        if (range && !isDependencySatisfied(range, depRecord.meta.version)) {
          visiting.delete(name);
          this.#disableBrokenModule(
            name,
            `Module '${name}' requires '${depName}@${range}' but found version '${depRecord.meta.version}'`,
            broken,
          );
          return false;
        }
        if (!visit(depName)) {
          visiting.delete(name);
          this.#disableBrokenModule(
            name,
            `Module '${name}' disabled because its dependency '${depName}' is unavailable`,
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
