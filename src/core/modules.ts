import type { AddonRuntime } from "@lumi/downloader";
import type { CommandDefinition } from "@lumi/module-kit";
import type { LoadedModule, ModuleLoader } from "@lumi/module-runtime";
import type { Client, RESTPostAPIApplicationCommandsJSONBody } from "discord.js";

export interface RegisteredCommand extends CommandDefinition {
  module: string | null;
}

export function commandPayloadForGuild(
  registry: CommandRegistry,
  loader: Pick<ModuleLoader, "isActive">,
  guildId: string,
): RESTPostAPIApplicationCommandsJSONBody[] {
  return registry
    .all()
    .filter(
      (command) =>
        !command.module || loader.isActive(guildId, command.module),
    )
    .map((command) => command.data.toJSON());
}

export interface ModuleHostLogger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}






export function servicesForModule<T extends object>(
  services: T,
  moduleName: string,
): T & { __moduleName: string } {
  return { ...services, __moduleName: moduleName };
}

export class CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommand>();
  private readonly aliases = new Map<string, RegisteredCommand>();

  add(command: RegisteredCommand): boolean {
    const name = command.data.name;
    if (this.commands.has(name)) return false;

    this.commands.set(name, command);
    for (const alias of command.aliases ?? []) {
      const key = alias.toLowerCase();
      if (this.commands.has(key) || this.aliases.has(key)) continue;
      this.aliases.set(key, command);
    }
    return true;
  }

  removeModule(moduleName: string): void {
    for (const [name, command] of this.commands) {
      if (command.module === moduleName) this.commands.delete(name);
    }
    for (const [alias, command] of this.aliases) {
      if (command.module === moduleName) this.aliases.delete(alias);
    }
  }

  get(name: string): RegisteredCommand | undefined {
    const key = name.toLowerCase();
    return this.commands.get(key) ?? this.aliases.get(key);
  }

  all(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  payload(): RESTPostAPIApplicationCommandsJSONBody[] {
    return this.all().map((command) => command.data.toJSON());
  }

  get size(): number {
    return this.commands.size;
  }

  get aliasCount(): number {
    return this.aliases.size;
  }
}

export interface ModuleHostOptions {
  client: Client;
  loader: ModuleLoader;
  registry: CommandRegistry;
  services: Record<string, unknown>;
  logger: ModuleHostLogger;
  syncCommands: () => Promise<void>;
}

function guildIdFrom(args: unknown[]): string | null {
  for (const arg of args) {
    const value = arg as {
      guildId?: unknown;
      guild?: { id?: unknown };
    };
    if (typeof value?.guildId === "string") return value.guildId;
    if (typeof value?.guild?.id === "string") return value.guild.id;
  }
  return null;
}

export class ModuleHost implements AddonRuntime {
  private readonly disposers = new Map<string, Array<() => void>>();
  private readonly options: ModuleHostOptions;

  constructor(options: ModuleHostOptions) {
    this.options = options;
  }

  addStatic(commands: CommandDefinition[]): void {
    for (const command of commands) {
      this.options.registry.add({ ...command, module: null });
    }
  }

  async load(discovered: LoadedModule[]): Promise<LoadedModule[]> {
    const loaded = await this.options.loader.loadAll(discovered, this.options.services);
    for (const module of loaded) {
      this.attach(module);
    }
    await this.options.syncCommands();
    return loaded;
  }

  async mount(name: string): Promise<void> {
    const discovered = await this.options.loader.discover();
    const targets = discovered.filter(
      (module) => module.manifest.name === name || module.supermodule === name,
    );
    if (targets.length === 0) {
      throw new Error(`Add-on "${name}" was not discovered.`);
    }

    await this.options.loader.loadAll(targets, this.options.services);
    for (const target of targets) {
      const loaded = this.options.loader.getModule(target.manifest.name);
      if (loaded) this.attach(loaded);
    }
    await this.options.syncCommands();
  }

  has(name: string): boolean {
    return Boolean(this.options.loader.getModule(name));
  }

  async unmount(name: string): Promise<void> {
    const removed = await this.options.loader.unload(name);
    for (const module of removed) {
      this.detach(module.manifest.name);
    }
    await this.options.syncCommands();
  }





  async unloadAll(): Promise<void> {
    const names = this.options.loader
      .listAll()
      .map((module) => module.manifest.name);
    for (const name of names) {
      this.detach(name);
    }
    for (const name of names) {
      try {
        await this.options.loader.unload(name);
      } catch (error) {
        this.options.logger.error("Failed to unload module", {
          module: name,
          error,
        });
      }
    }
  }

  async reload(name: string): Promise<void> {
    const targets = this.options.loader
      .listAll()
      .filter((module) => module.manifest.name === name || module.supermodule === name);

    for (const target of targets) {
      this.detach(target.manifest.name);
      await this.options.loader.reload(target.manifest.name);
      const loaded = this.options.loader.getModule(target.manifest.name);
      if (loaded) this.attach(loaded);
    }
    await this.options.syncCommands();
  }

  private attach(module: LoadedModule): void {
    this.detach(module.manifest.name);

    const moduleName = module.manifest.name;
    const moduleServices = servicesForModule(this.options.services, moduleName);
    const disposers: Array<() => void> = [];
    for (const listener of module.definition.listeners ?? []) {
      const handler = listener.handler;
      const event = listener.event;
      const wrapped = (...args: unknown[]) => {
        const guildId = guildIdFrom(args);
        if (
          guildId &&
          !this.options.loader.isActive(guildId, module.manifest.name)
        ) {
          return;
        }
        void handler(...args, moduleServices).catch((error) =>
          this.options.logger.error(`[${moduleName}] listener ${event} failed:`, error),
        );
      };
      if (listener.once) {
        this.options.client.once(event, wrapped);
      } else {
        this.options.client.on(event, wrapped);
      }
      disposers.push(() => this.options.client.off(event, wrapped));
    }
    this.disposers.set(moduleName, disposers);

    for (const command of module.definition.commands ?? []) {
      if (!this.options.registry.add({ ...command, module: moduleName })) {
        this.options.logger.warn(
          `Command /${command.data.name} from ${moduleName} collides with an existing command.`,
        );
      }
    }
  }

  private detach(name: string): void {
    for (const dispose of this.disposers.get(name) ?? []) {
      dispose();
    }
    this.disposers.delete(name);
    this.options.registry.removeModule(name);
  }
}
