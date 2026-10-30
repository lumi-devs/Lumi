import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";






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
  client: Client;
  modules: {
    isEnabled: (guildId: string, moduleName: string) => boolean;
  };
}

export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | CommandDataStub;





export interface CommandDataStub {
  readonly name: string;


  toJSON(): any;
}

export interface CommandDefinition {
  data: CommandData;


  execute: (
    interaction: ChatInputCommandInteraction,
    services: any,
  ) => Promise<void>;
  autocomplete?: (
    interaction: AutocompleteInteraction,
    services: any,
  ) => Promise<void>;
  aliases?: readonly string[];
  requiredPermit?: string;
  requiresAdmin?: boolean;
  dmPermission?: boolean;
  defaultMemberPermissions?: bigint | null;
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
