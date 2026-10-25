import { ChatInputCommandInteraction, AutocompleteInteraction, ButtonInteraction, SelectMenuInteraction, ModalSubmitInteraction } from "discord.js";

export interface ConfigField {
  key: string;
  label: string;
  type: "boolean" | "number" | "string" | "channel" | "role" | "multi-channel" | "multi-role" | "json";
  description?: string;
}

export interface CommandDefinition {
  data: any; // SlashCommandBuilder
  execute: (interaction: ChatInputCommandInteraction, services: any) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, services: any) => Promise<void>;
  requiredPermit?: string;
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