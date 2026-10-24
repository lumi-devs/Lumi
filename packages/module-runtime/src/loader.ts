import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import semver from "semver";
import type {
  CommandDef,
  ListenerDef,
  LoadedModule,
  LumiServices,
  ModuleDefinition,
  ModuleRegistry,
} from "@lumi/module-kit";
import type { ModuleControl, ModuleState, ModuleStatus } from "@lumi/contracts";
import { discoverModules, type BrokenModule, type ModuleRoot, type DiscoveredModule } from "./discovery.ts";
import { safeParseManifest, type ModuleManifest } from "./manifest.ts";

export interface ModuleLoaderOptions {
  roots: readonly ModuleRoot[];
  getServices?: () => LumiServices;
  botVersion: string;
  reservedCommands?: readonly string[] | undefined;
  onChange?: (() => void | Promise<void>) | undefined;
}

interface LoadedRecord {
  discovered: DiscoveredModule;
  definition: ModuleDefinition | undefined;
  commands: Map<string, CommandDef>;
  disposers: Array<() => void>;
  state: ModuleState;
  error: string | undefined;
}

export class ModuleLoader implements ModuleRegistry, ModuleControl {
  readonly #roots: readonly ModuleRoot[];
  readonly #getServices: () => LumiServices;
  readonly #botVersion: string;
  readonly #reservedCommands: ReadonlySet<string>;
  readonly #onChange: (() => void | Promise<void>) | undefined;
  readonly #records = new Map<string, LoadedRecord>();
  readonly #broken = new Map<string, BrokenModule>();
  // O(1) command lookup instead of linear scan across all modules
  readonly #commandIndex = new Map<string, CommandDef>();
  // Cached computed values, refreshed on load/reload/unload
  #cachedLoadedModules: readonly LoadedModule[] | undefined;
  #cachedCommands: readonly CommandDef[] | undefined;
  #cachedStatuses: readonly ModuleStatus[] | undefined;

  public constructor(options: ModuleLoaderOptions) {
    this.#roots = options.roots;
    this.#getServices = options.getServices ?? (() => { throw new Error("services not initialized"); });
    this.#botVersion = options.botVersion;
    this.#reservedCommands = new Set(options.reservedCommands ?? []);
    this.#onChange = options.onChange;
  }

  public setGetServices(getServices: () => LumiServices): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).#getServices = getServices;
  }

  public async load(): Promise<void> {
    if (this.#records.size > 0) await this.unloadAll();
    this.#records.clear();
    this.#broken.clear();
    this.#commandIndex.clear();
    this.#invalidateCaches();

    const discovery = await discoverModules(this.#roots);
    for (const broken of discovery.broken) {
      this.#broken.set(path.basename(broken.dir), broken);
    }

    const byName = new Map(discovery.modules.map((module) => [module.manifest.name, module]));
    const sorted = this.#sort(byName);
    const failed = new Set<string>();

    for (const name of sorted) {
      const module = byName.get(name)!;
      const dependencyFailure = Object.keys(module.manifest.dependencies).find(
        (dependency) => failed.has(dependency) || this.#broken.has(dependency),
      );
      if (dependencyFailure) {
        this.#markFailed(module, `dependency '${dependencyFailure}' failed to load`, failed);
        continue;
      }

      const record = this.#record(module);
      this.#records.set(name, record);

      const services = this.#getServices();
      const enabled = await services.db.modules.isGlobalEnabled(name);
      if (!enabled) {
        record.state = "disabled";
        continue;
      }

      try {
        await this.#loadOne(record);
      } catch (error) {
        this.#markFailed(module, error instanceof Error ? error.message : String(error), failed);
      }
    }

    await this.#notifyChange();
  }

  public async reload(name: string): Promise<void> {
    const record = this.#records.get(name);
    if (!record) throw new Error(`Unknown module: ${name}`);
    await this.#unloadRecord(name);
    try {
      const manifest = await this.#readManifest(record.discovered.dir);
      if (manifest.name !== name) throw new Error(`manifest name '${manifest.name}' does not match module '${name}'`);
      const entry = path.resolve(record.discovered.dir, manifest.entry);
      const relativeEntry = path.relative(record.discovered.dir, entry);
      if (relativeEntry.length === 0 || relativeEntry.startsWith("..") || path.isAbsolute(relativeEntry)) {
        throw new Error(`entry '${manifest.entry}' escapes the module directory`);
      }
      record.discovered = { ...record.discovered, manifest, entry };
      await this.#loadOne(record);
    } catch (error) {
      record.state = "failed";
      record.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await this.#notifyChange();
    }
  }

  public async unload(name: string): Promise<void> {
    await this.#unloadRecord(name);
    await this.#notifyChange();
  }

  async #unloadRecord(name: string): Promise<void> {
    const record = this.#records.get(name);
    if (!record) return;
    // Remove commands from index
    for (const cmdName of record.commands.keys()) {
      const indexed = this.#commandIndex.get(cmdName);
      if (indexed === record.commands.get(cmdName)) {
        this.#commandIndex.delete(cmdName);
      }
    }
    for (const dispose of record.disposers.reverse()) {
      try {
        dispose();
      } catch (error) {
        this.#getServices().logger.warn({ error, module: name }, "module disposer failed");
      }
    }
    record.disposers = [];
    record.commands.clear();
    try {
      await record.definition?.onUnload?.(this.#getServices());
    } catch (error) {
      this.#getServices().logger.error({ error, module: name }, "module onUnload failed");
    }
    record.definition = undefined;
    record.state = "disabled";
    this.#invalidateCaches();
  }

  public async setEnabled(name: string, enabled: boolean): Promise<void> {
    const services = this.#getServices();
    const record = this.#records.get(name);
    if (!record) throw new Error(`Unknown module: ${name}`);

    await services.db.modules.setGlobal(name, enabled);
    if (enabled) {
      try {
        if (record.state !== "loaded") await this.#loadOne(record);
      } catch (error) {
        record.state = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        await this.#notifyChange();
      }
    } else {
      await this.unload(name);
    }
  }

  public all(): readonly LoadedModule[] {
    if (this.#cachedLoadedModules) return this.#cachedLoadedModules;
    const result = [...this.#records.values()]
      .filter((record): record is LoadedRecord & { definition: ModuleDefinition } => record.definition !== undefined)
      .map((record) => ({ definition: record.definition, commands: record.commands }));
    this.#cachedLoadedModules = result;
    return result;
  }

  public get(name: string): LoadedModule | undefined {
    const record = this.#records.get(name);
    if (!record?.definition) return undefined;
    return { definition: record.definition, commands: record.commands };
  }

  public command(name: string): CommandDef | undefined {
    return this.#commandIndex.get(name);
  }

  public commands(): readonly CommandDef[] {
    if (this.#cachedCommands) return this.#cachedCommands;
    const result = [...this.#records.values()].flatMap((record) => [...record.commands.values()]);
    this.#cachedCommands = result;
    return result;
  }

  public async isEnabled(guildId: string | null, name: string): Promise<boolean> {
    const record = this.#records.get(name);
    if (!record || record.state !== "loaded") return false;
    return this.#getServices().db.modules.isEnabled(guildId, name);
  }

  public async unloadAll(): Promise<void> {
    for (const name of [...this.#records.keys()].reverse()) {
      await this.#unloadRecord(name).catch((error: unknown) => {
        this.#getServices().logger.warn({ error, module: name }, "module unload failed");
      });
    }
  }

  public status(): readonly ModuleStatus[] {
    if (this.#cachedStatuses) return this.#cachedStatuses;
    const statuses: ModuleStatus[] = [...this.#records.values()].map((record) => {
      const manifest = record.discovered.manifest;
      return {
        name: manifest.name,
        displayName: manifest.displayName,
        emoji: manifest.emoji,
        description: manifest.description,
        version: manifest.version,
        origin: record.discovered.origin,
        state: record.state,
        commandCount: record.commands.size,
        ...(record.error ? { error: record.error } : {}),
      };
    });
    for (const broken of this.#broken.values()) {
      const name = path.basename(broken.dir);
      statuses.push({
        name,
        displayName: name,
        emoji: "⚠️",
        description: broken.issues.join("; "),
        version: "0.0.0",
        origin: broken.origin,
        state: "failed",
        commandCount: 0,
        error: broken.issues.join("; "),
      });
    }
    this.#cachedStatuses = statuses;
    return statuses;
  }

  #invalidateCaches(): void {
    this.#cachedLoadedModules = undefined;
    this.#cachedCommands = undefined;
    this.#cachedStatuses = undefined;
  }

  async #loadOne(record: LoadedRecord): Promise<void> {
    const services = this.#getServices();
    const base = pathToFileURL(record.discovered.entry).href;
    const url = `${base}?v=${crypto.randomUUID()}`;
    const imported = (await import(url)) as Record<string, unknown>;
    const definition = findDefinition(imported, record.discovered.manifest.name);
    if (!definition) {
      throw new Error(`${record.discovered.entry} does not export a module definition`);
    }
    if (definition.name !== record.discovered.manifest.name) {
      throw new Error(`definition name '${definition.name}' does not match manifest '${record.discovered.manifest.name}'`);
    }

    const names = new Set<string>();
    for (const command of definition.commands ?? []) {
      if (!/^[a-z0-9_-]{1,32}$/.test(command.name)) {
        throw new Error(`invalid command name '${command.name}'`);
      }
      if (names.has(command.name)) throw new Error(`duplicate command in module: ${command.name}`);
      if (typeof command.run !== "function") {
        throw new Error(`command '${command.name}' has no run function`);
      }
      if (command.description.length < 1 || command.description.length > 100) {
        throw new Error(`command '${command.name}' description must be 1-100 characters`);
      }
      if (command.build) {
        try {
          const builder = command.build();
          if (builder.name !== command.name) {
            throw new Error(`builder name '${builder.name}' does not match '${command.name}'`);
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`command '${command.name}' build failed: ${reason}`);
        }
      }
      names.add(command.name);
      if (command.module !== definition.name) {
        throw new Error(
          `command '${command.name}' must declare module '${definition.name}', got '${command.module ?? "null"}'`,
        );
      }
      if (this.#reservedCommands.has(command.name)) {
        throw new Error(`command '${command.name}' conflicts with a built-in command`);
      }
      // Check cross-module duplicate via index
      const existing = this.#commandIndex.get(command.name);
      if (existing && existing !== record.commands.get(command.name)) {
        throw new Error(`Duplicate command across modules: ${command.name}`);
      }
    }

    for (const listener of definition.listeners ?? []) {
      if (listener.module !== definition.name) {
        throw new Error(
          `listener '${listener.name}' must declare module '${definition.name}', got '${listener.module ?? "null"}'`,
        );
      }
      if (typeof listener.execute !== "function") {
        throw new Error(`listener '${listener.name}' has no execute function`);
      }
    }

    record.definition = definition;
    try {
      await definition.onLoad?.(services);
    } catch (error) {
      try {
        await definition.onUnload?.(services);
      } catch {
        // the original load error is the useful one
      }
      record.definition = undefined;
      throw error;
    }
    record.error = undefined;
    record.commands.clear();

    for (const command of definition.commands ?? []) {
      record.commands.set(command.name, command);
      this.#commandIndex.set(command.name, command);
    }

    try {
      for (const listener of definition.listeners ?? []) {
        record.disposers.push(this.#attachListener(services, listener));
      }
    } catch (error) {
      for (const dispose of record.disposers.splice(0)) dispose();
      record.commands.clear();
      try {
        await definition.onUnload?.(services);
      } catch {
        // the original listener error is the useful one
      }
      record.definition = undefined;
      throw error;
    }

    record.state = "loaded";
    this.#invalidateCaches();
    services.logger.info(
      { module: definition.name, version: record.discovered.manifest.version },
      "module loaded",
    );
  }

  #attachListener(services: LumiServices, listener: ListenerDef): () => void {
    const event = listener.event as never;
    const execute = listener.execute as unknown as (
      services: LumiServices,
      ...args: unknown[]
    ) => Promise<void> | void;
    let fired = false;
    const run = (...args: unknown[]): void => {
      if (listener.once && fired) return;
      fired = true;
      try {
        Promise.resolve(execute(services, ...args)).catch((error: unknown) => {
          services.logger.error({ error, listener: listener.name, module: listener.module }, "module listener failed");
        });
      } catch (error) {
        services.logger.error({ error, listener: listener.name, module: listener.module }, "module listener threw");
      }
      if (listener.once) services.client.off(event, run as never);
    };

    services.client.on(event, run as never);
    return () => services.client.off(event, run as never);
  }

  async #notifyChange(): Promise<void> {
    if (!this.#onChange) return;
    try {
      await this.#onChange();
    } catch (error) {
      this.#getServices().logger.error({ error }, "module change hook failed");
    }
  }

  #record(module: DiscoveredModule): LoadedRecord {
    return {
      discovered: module,
      definition: undefined,
      commands: new Map(),
      disposers: [],
      state: "disabled",
      error: undefined,
    };
  }

  #markFailed(module: DiscoveredModule, reason: string, failed: Set<string>): void {
    failed.add(module.manifest.name);
    this.#records.set(module.manifest.name, {
      discovered: module,
      definition: undefined,
      commands: new Map(),
      disposers: [],
      state: "failed",
      error: reason,
    });
    this.#getServices().logger.error({ module: module.manifest.name, reason }, "module failed to load");
  }

  #sort(modules: Map<string, DiscoveredModule>): string[] {
    const errors = new Map<string, string[]>();
    for (const module of modules.values()) {
      const issues: string[] = [];
      for (const [dependency, range] of Object.entries(module.manifest.dependencies)) {
        const target = modules.get(dependency);
        if (!target) {
          issues.push(`missing dependency '${dependency}'`);
          continue;
        }
        if (!semver.satisfies(target.manifest.version, range)) {
          issues.push(`dependency '${dependency}' requires ${range}, found ${target.manifest.version}`);
        }
      }
      for (const conflict of module.manifest.conflicts) {
        if (modules.has(conflict)) issues.push(`conflicts with '${conflict}'`);
      }
      if (module.manifest.minBotVersion && semver.lt(this.#botVersion, module.manifest.minBotVersion)) {
        issues.push(`requires bot >= ${module.manifest.minBotVersion}, running ${this.#botVersion}`);
      }
      if (module.manifest.maxBotVersion && semver.gt(this.#botVersion, module.manifest.maxBotVersion)) {
        issues.push(`requires bot <= ${module.manifest.maxBotVersion}, running ${this.#botVersion}`);
      }
      if (issues.length > 0) {
        errors.set(module.manifest.name, issues);
        this.#broken.set(module.manifest.name, {
          dir: module.dir,
          origin: module.origin,
          issues,
        });
      }
    }

    for (const name of errors.keys()) modules.delete(name);

    const order: string[] = [];
    const state = new Map<string, "visiting" | "visited">();
    const stack: string[] = [];
    const cyclic = new Set<string>();

    const visit = (name: string): void => {
      const current = state.get(name);
      if (current === "visited" || cyclic.has(name)) return;
      if (current === "visiting") {
        const start = stack.indexOf(name);
        const cycle = start < 0 ? [name] : stack.slice(start);
        const issues = [`dependency cycle: ${[...cycle, name].join(" -> ")}`];
        for (const member of cycle) {
          cyclic.add(member);
          const module = modules.get(member);
          if (module) {
            this.#broken.set(member, { dir: module.dir, origin: module.origin, issues });
          }
        }
        return;
      }

      state.set(name, "visiting");
      stack.push(name);
      const module = modules.get(name);
      if (module) {
        for (const dependency of Object.keys(module.manifest.dependencies)) {
          if (modules.has(dependency)) visit(dependency);
        }
      }
      stack.pop();
      state.set(name, "visited");
      if (!cyclic.has(name)) order.push(name);
    };

    for (const name of modules.keys()) visit(name);
    for (const name of cyclic) modules.delete(name);
    return order;
  }

  async #readManifest(dir: string): Promise<ModuleManifest> {
    const raw = await readFile(path.join(dir, "manifest.json"), "utf8");
    const parsed = safeParseManifest(JSON.parse(raw));
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    return parsed.manifest;
  }
}

function findDefinition(imported: Record<string, unknown>, name: string): ModuleDefinition | undefined {
  const candidates = [imported["default"], imported["module"], ...Object.values(imported)];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const definition = candidate as Partial<ModuleDefinition>;
    if (typeof definition.name === "string" && definition.name === name && typeof definition.description === "string") {
      return candidate as ModuleDefinition;
    }
  }
  return undefined;
}