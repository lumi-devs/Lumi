import { SlashCommandBuilder } from "@discordjs/builders";
import type { BaseCommand, CommandRegistry } from "./commands.js";

export function captureBuilder(command: BaseCommand): Record<string, unknown> | null {
  if (!command.registerApplicationCommands) return null;

  let json: Record<string, unknown> | null = null;
  const registry: CommandRegistry = {
    registerChatInputCommand(build) {
      json = build(new SlashCommandBuilder()).toJSON() as Record<string, unknown>;
    },
  };
  command.registerApplicationCommands(registry);
  return json;
}
