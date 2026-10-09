import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Collection } from "discord.js";
import type {
  AutocompleteInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { CommandContext } from "#lib/commands/context.js";
import type { Container } from "#lib/services.js";

export type CommandBuilder =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface SubcommandHandler {
  run: (ctx: CommandContext) => unknown;
  requiredPermit?: string;
  guildOnly?: boolean;
  botOwner?: boolean;
}

export interface CommandDef {
  name: string;
  module?: string;
  description?: string;
  aliases?: string[];
  guildOnly?: boolean;
  botOwner?: boolean;
  requiredPermit?: string;
  requiredClientPermissions?: bigint[];
  defaultMemberPermissions?: bigint | null;
  prefixEnabled?: boolean;
  cooldownMs?: number;
  build?: () => CommandBuilder;
  run?: (ctx: CommandContext) => unknown;
  handlers?: Record<string, ((ctx: CommandContext) => unknown) | SubcommandHandler>;
  defaultSub?: string;
  aliasSub?: Record<string, string>;
  autocomplete?: (
    services: Container,
    interaction: AutocompleteInteraction,
  ) => unknown;
  contextMenu?: {
    build: () => ContextMenuCommandBuilder;
    run: (
      services: Container,
      interaction: MessageContextMenuCommandInteraction,
    ) => unknown;
  };
  menuName?: string;
  onUnload?: () => unknown;
}

export function asHandler(
  handler: ((ctx: CommandContext) => unknown) | SubcommandHandler,
): SubcommandHandler {
  return typeof handler === "function" ? { run: handler } : handler;
}

export const commandRegistry = new Collection<string, CommandDef>();

export function registerCommandDef(def: CommandDef): void {
  commandRegistry.set(def.name, def);
  for (const alias of def.aliases ?? []) {
    if (!commandRegistry.has(alias)) commandRegistry.set(alias, def);
  }
  if (def.menuName && !commandRegistry.has(def.menuName)) {
    commandRegistry.set(def.menuName, def);
  }
}

export async function loadCommandDefs(moduleDir: string): Promise<void> {
  const dir = path.join(moduleDir, "commands");
  let files: string[];
  try {
    files = (await fs.readdir(dir))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .sort();
  } catch {
    return;
  }
  for (const file of files) {
    const exported = (await import(
      pathToFileURL(path.join(dir, file)).href
    )) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (typeof value !== "object" || value === null) continue;
      const def = value as CommandDef;
      if (typeof def.name !== "string") continue;
      if (typeof def.build !== "function" && typeof def.contextMenu?.build !== "function") {
        continue;
      }
      registerCommandDef(def);
    }
  }
}
