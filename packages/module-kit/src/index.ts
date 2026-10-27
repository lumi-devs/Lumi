import { z } from "zod";
import type { CommandDefinition, ListenerDefinition, TaskDefinition, ConfigField, ModuleCapability, ModuleServices } from "./types.js";

export interface ModuleDefinition {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  config: any;
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

export type Disposer = () => void | Promise<void>;

export function defineModule<T extends ModuleDefinition>(def: T): T {
  return def;
}

export * from "./types.js";