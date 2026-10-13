import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import {
  emptySetupState,
  finishSetupWizard,
  hasSetupAccess,
  normalizeSetupState,
  setupAccessDenied,
  stateFromSegments,
} from "#src/modules/onboarding/services/SetupWizard.js";
import {
  buildSetupAgeModal,
  buildSetupReviewView,
  buildSetupStepView,
  buildSetupSuccessCard,
} from "#src/modules/onboarding/ui/SetupWizard.js";
import { SetupId } from "#src/modules/core/Constants.js";
import type { ButtonInteraction } from "discord.js";

export const setupWizardButton = defineInteraction({
  prefix: SetupId.prefix,
  async run(services: Container, interaction: ButtonInteraction) {
    const parsed = SetupId.parse(interaction.customId);
    if (!parsed) return;
    const { head, rest } = parsed;
    if (head !== "step" && head !== "finish" && head !== "agebtn") return;
    if (!interaction.inGuild()) return;

    if (head === "agebtn") {
      if (!(await hasSetupAccess(interaction))) throw setupAccessDenied();
      return interaction.showModal(
        buildSetupAgeModal(stateFromSegments(rest)),
      );
    }

    await acknowledge(interaction);
    if (!(await hasSetupAccess(interaction))) throw setupAccessDenied();
    const { guildId } = interaction;

    if (head === "finish") {
      const settled = normalizeSetupState(stateFromSegments(rest));
      await finishSetupWizard(services, guildId, settled, interaction.user.id);
      return interaction.editReply(buildSetupSuccessCard(settled));
    }

    const target = Number(rest[0]);
    const state = stateFromSegments(rest.slice(1));
    if (target === 2) return interaction.editReply(buildSetupStepView(2, state));
    if (target === 3) return interaction.editReply(buildSetupStepView(3, state));
    if (target === 4) {
      return interaction.editReply(
        buildSetupReviewView(normalizeSetupState(state)),
      );
    }
    return interaction.editReply(buildSetupStepView(1, emptySetupState()));
  },
});
