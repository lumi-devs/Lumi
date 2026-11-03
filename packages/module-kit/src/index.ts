export type {
  EconomyFailureReason,
  EconomyGuard,
  EconomyOperationResult,
} from "@lumi/db";

import type {
  CommandDefinition,
  ListenerDefinition,
  ModuleCapability,
  ModuleDataLifecycle,
  ModuleServices,
  TaskDefinition,
} from "./types.js";

export interface ModuleDefinition {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  config: unknown;
  configVersion?: number;
  configMigrations?: Readonly<Record<number, (config: unknown) => unknown>>;
  dataLifecycle?: ModuleDataLifecycle;
  commands: readonly CommandDefinition[];
  listeners: readonly ListenerDefinition[];
  tasks: readonly TaskDefinition[];
  permitNodes?: readonly string[];
  onLoad: (services: ModuleServices) => Promise<Disposer[]>;
  onUnload: (services: ModuleServices) => Promise<void>;
  dependencies?: Readonly<Record<string, string>>;
  requirements?: readonly string[];
  conflicts?: readonly string[];
  capabilities?: readonly ModuleCapability[];
}

export type Disposer = () => void | Promise<void>;

export function defineModule<T extends ModuleDefinition>(def: T): T {
  return def;
}

export * from "./types.js";
