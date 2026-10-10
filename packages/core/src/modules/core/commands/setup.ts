import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { emptySetupState } from "../services/setup-wizard.js";
import { buildSetupStepView } from "@lumi/modules/core/ui/setup-wizard.js";

export const setupDef: CommandDef = {
  name: "setup",
  description: "Launch the ephemeral server setup wizard.",
  guildOnly: true,
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  build: () => {
    const b = new SlashCommandBuilder().setName("setup");
    return (
      b
        .setName("setup")
        .setDescription("Launch the ephemeral server setup wizard.")
    );
  },
  run: async (ctx: CommandContext): Promise<void> => {
    await ctx.reply(buildSetupStepView(1, emptySetupState()));
  },
};
