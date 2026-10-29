import type { AutocompleteInteraction, ChatInputCommandInteraction, } from "discord.js";

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
}

export interface CommandDefinition {
  data: any; // SlashCommandBuilder
  execute: (interaction: ChatInputCommandInteraction, services: any) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, services: any) => Promise<void>;
  aliases?: string[];
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
  handler: (services: any) => Promise<void>;
  timezone?: string;
}

export interface ModuleCapability {
  name: string;
  version: string;
  provides: string[];
}