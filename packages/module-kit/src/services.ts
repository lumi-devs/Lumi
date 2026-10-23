import type { Cache } from "@lumi/cache";
import type { AddonControl, ModuleControl } from "@lumi/contracts";
import type { DatabaseCaches, DatabaseService } from "@lumi/db";
import type { Logger } from "@lumi/foundation";
import type { InvalidationPort, RedisClient, RedisKeys } from "@lumi/redis";
import type { Client } from "discord.js";
import type { CommandDef } from "./command.ts";
import type { ModuleDefinition } from "./module.ts";

export interface LoadedModule {
  readonly definition: ModuleDefinition;
  readonly commands: ReadonlyMap<string, CommandDef>;
}

export interface ModuleRegistry {
  all(): readonly LoadedModule[];
  get(name: string): LoadedModule | undefined;
  command(name: string): CommandDef | undefined;
  commands(): readonly CommandDef[];
  isEnabled(guildId: string | null, name: string): Promise<boolean>;
}

export interface RuntimeConfig {
  readonly defaultPrefix: string;
  readonly ownerIds: ReadonlySet<string>;
}

export interface LumiServices {
  readonly client: Client;
  readonly logger: Logger;
  readonly db: DatabaseService;
  readonly cache: Cache;
  readonly caches: DatabaseCaches;
  readonly redis: RedisClient;
  readonly invalidation: InvalidationPort;
  readonly keys: RedisKeys;
  readonly modules: ModuleRegistry;
  readonly moduleControl: ModuleControl;
  readonly addons: AddonControl;
  readonly runtime: RuntimeConfig;
}
