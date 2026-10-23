import { SlashCommandBuilder } from "discord.js";
import type { CommandDef, LoadedModule } from "@lumi/bot-kit";
import { makeInfoCard } from "@lumi/ui";

export function makeHelpCommand(builtins: readonly CommandDef[]): CommandDef {
  return {
    name: "help",
    description: "List built-in commands and installed modules.",
    module: null,
    prefix: true,
    build: () => new SlashCommandBuilder().setName("help").setDescription("List commands and modules."),
    async run(ctx) {
      const loaded = ctx.services.modules.all();
      const modules: LoadedModule[] = [];
      for (const module of loaded) {
        if (await ctx.services.modules.isEnabled(ctx.guildId, module.definition.name)) modules.push(module);
      }
      const builtinLines = builtins.map((command) => `**/${command.name}** — ${command.description}`);
      const moduleLines = modules.map((module) => {
        const commands = [...module.commands.keys()].map((name) => `\`${name}\``).join(", ");
        return `**${module.definition.emoji} ${module.definition.displayName}** — ${module.definition.description}${commands ? `\n${commands}` : ""}`;
      });

      return ctx.reply(
        makeInfoCard("Commands", [
          ...builtinLines,
          ...(moduleLines.length > 0 ? ["", "**Modules**", ...moduleLines] : ["", "No modules loaded."]),
        ]),
      );
    },
  };
}
