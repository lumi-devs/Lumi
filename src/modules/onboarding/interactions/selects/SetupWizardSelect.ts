import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import {
  VerificationModes,
  emptySetupState,
  hasSetupAccess,
  setupAccessDenied,
  stateFromSegments,
} from "#src/modules/onboarding/services/SetupWizard.js";
import { buildSetupStepView } from "#src/modules/onboarding/ui/SetupWizard.js";
import { SetupStepId } from "#src/lib/interactions/Ids.js";
import type { AnySelectMenuInteraction } from "discord.js";

export const setupWizardSelect = defineInteraction({
  prefix: SetupStepId.prefix,
  async run(_services: Container, interaction: AnySelectMenuInteraction) {
    const parsed = SetupStepId.parse(interaction.customId);
    if (!parsed) return;
    const parts = ["setup", "step", ...parsed.segments];
    const tail = parts[parts.length - 1];
    if (tail !== "ch" && tail !== "vmode") return;
    if (!interaction.inGuild()) return;
    await acknowledge(interaction);
    if (!(await hasSetupAccess(interaction))) throw setupAccessDenied();

    if (tail === "ch") {
      const logChannelId =
        interaction.isChannelSelectMenu() && interaction.values.length > 0
          ? (interaction.values[0] ?? null)
          : null;
      return interaction.editReply(
        buildSetupStepView(2, { ...emptySetupState(), logChannelId }),
      );
    }

    if (!interaction.isStringSelectMenu()) return;
    const mode = interaction.values[0];
    if (!mode || !(VerificationModes as readonly string[]).includes(mode)) {
      return;
    }
    const base = stateFromSegments(parts.slice(3, -1));
    return interaction.editReply(
      buildSetupStepView(3, { ...base, verificationMode: mode }),
    );
  },
});
