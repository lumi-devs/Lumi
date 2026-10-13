import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { emptySetupState } from "#src/modules/onboarding/services/SetupWizard.js";
import { buildSetupStepView } from "#src/modules/onboarding/ui/SetupWizard.js";

export const setupDef: CommandDef = {
  name: "setup",
  description: "Launch the ephemeral server setup wizard.",
  guildOnly: true,
  requiredPermit: "admin.setup",
  build: () =>
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Launch the ephemeral server setup wizard."),
  run: async (ctx: CommandContext): Promise<void> => {
    await ctx.reply(buildSetupStepView(1, emptySetupState()));
  },
};
