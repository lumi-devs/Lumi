import { z } from "zod";
import type { CommandDefinition, ListenerDefinition, TaskDefinition, ConfigField, ModuleCapability } from "./types.js";

export interface ModuleDefinition {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  config: z.ZodObject<any>;
  configFields: ConfigField[];
  commands: CommandDefinition[];
  listeners: ListenerDefinition[];
  tasks: TaskDefinition[];
  onLoad: (services: ModuleServices) => Promise<Disposer[]>;
  onUnload: (services: ModuleServices) => Promise<void>;
  dependencies?: Record<string, string>;
  requirements?: string[];
  conflicts?: string[];
  capabilities?: ModuleCapability[];
}

export interface ModuleServices {
  db: any;
  cache: any;
  redis: any;
  rpc: any;
  discord: any;
  permits: any;
  config: any;
  ui: any;
  scheduler: any;
  observability: any;
  modules: {
    isEnabled: (guildId: string, moduleName: string) => boolean;
  };
  __moduleName?: string;
}

export type Disposer = () => void | Promise<void>;

export function defineModule<T extends ModuleDefinition>(def: T): T {
  return def;
}

export * from "./types.js";