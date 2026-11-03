import type { DbHelpers } from "@lumi/db";
import type { Logger } from "@lumi/foundation";
import type { HealthMonitor } from "@lumi/observability";
import type { PermitRepository } from "@lumi/permits";
import type { DistributedScheduler } from "@lumi/scheduler";
import type * as Ui from "@lumi/ui";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
  RESTPostAPIApplicationCommandsJSONBody,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export interface ModuleConfigAccess {
  get(guildId: string, key: string): Promise<unknown>;
  set(guildId: string, key: string, value: unknown): Promise<void>;
  getAll(guildId: string): Promise<Record<string, unknown>>;
  update(
    guildId: string,
    key: string,
    updater: (value: unknown) => unknown,
  ): Promise<unknown>;
  reset(guildId: string, key: string): Promise<void>;
}

export interface ModuleRegistryAccess {
  isEnabled(guildId: string, moduleName: string): boolean;
}

export interface ModuleConfigService {
  read(guildId: string, moduleName: string, key?: string): Promise<unknown>;
  save(
    guildId: string,
    moduleName: string,
    key: string,
    value: unknown,
  ): Promise<void>;
}

export interface ModuleServices {
  rpc: unknown;
  discord: { PermissionFlagsBits: typeof PermissionFlagsBits };
  permits: PermitRepository;
  config: ModuleConfigAccess;
  moduleConfig: ModuleConfigService;
  ui: typeof Ui;
  scheduler: DistributedScheduler;
  observability: { logger: Logger; healthMonitor?: HealthMonitor };
  client: Client;
  modules: ModuleRegistryAccess;
  helpers: DbHelpers;
  readonly moduleName?: string;
}

export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | CommandDataStub;

export interface CommandDataStub {
  readonly name: string;

  toJSON(): RESTPostAPIApplicationCommandsJSONBody;
}

export interface CommandDefinition {
  data: CommandData;

  execute: (
    interaction: ChatInputCommandInteraction,
    services: ModuleServices,
  ) => Promise<void>;
  autocomplete?: (
    interaction: AutocompleteInteraction,
    services: ModuleServices,
  ) => Promise<void>;
  aliases?: readonly string[];
  prefixOnly?: boolean;
  requiredPermit?: string;
  requiresAdmin?: boolean;
  ownerOnly?: boolean;
  guildOnly?: boolean;
  dmPermission?: boolean;
  defaultMemberPermissions?: bigint | null;
  cooldownSeconds?: number;
  concurrency?: number;
}

export interface ListenerDefinition {
  event: string;

  handler: (...args: any[]) => Promise<void>;
  once?: boolean;
}

export interface TaskDefinition {
  name: string;
  cron: string;
  handler: (services: ModuleServices) => Promise<void>;
  timezone?: string;
}

export interface ModuleCapability {
  readonly name: string;
  readonly version: string;
  readonly provides: readonly string[];
}

export interface UserDataDeletionResult {
  deleted?: number;
  anonymised?: number;
  notes?: string[];
}

export interface ModuleDataLifecycle {
  exportUserData?: (
    services: ModuleServices,
    guildId: string,
    userId: string,
  ) => Promise<unknown>;
  deleteUserData?: (
    services: ModuleServices,
    guildId: string,
    userId: string,
  ) => Promise<UserDataDeletionResult | undefined>;
}
