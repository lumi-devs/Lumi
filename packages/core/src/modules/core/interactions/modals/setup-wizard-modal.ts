import {
  hasSetupAccess,
  parseMinAgeHours,
  stateFromSegments,
} from "../../services/setup-wizard.js";
import { buildSetupStepView } from "@lumi/modules/core/ui/setup-wizard.js";
import { ephemeralCard, makeErrorCard } from "@lumi/lib/ui/cards.js";
import { SetupAgeModalId } from "../../constants.js";
import { defineInteraction } from "@lumi/lib/interactions/interaction-def.js";
import type { Container } from "@lumi/lib/services.js";
import type { ModalSubmitInteraction } from "discord.js";

export const setupWizardModal = defineInteraction({
  prefix: SetupAgeModalId.prefix,
  async run(_services: Container, interaction: ModalSubmitInteraction) {
    const parsed = SetupAgeModalId.parse(interaction.customId);
    if (!parsed) return;
    const { segments } = parsed;
    if (!interaction.inGuild()) return;
    await interaction.deferUpdate();

    if (!(await hasSetupAccess(interaction))) {
      return interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Permission Denied",
            "You need the Manage Server permission to run setup.",
          ),
        ),
      );
    }

    const state = stateFromSegments(segments);
    let raw: string | undefined;
    try {
      raw = interaction.fields.getTextInputValue("minAgeHours");
    } catch {
      raw = undefined;
    }
    const parsedAge = parseMinAgeHours(raw);
    if (parsedAge.error) {
      return interaction.followUp(ephemeralCard(makeErrorCard("Invalid Age", parsedAge.error)));
    }
    return interaction.editReply(
      buildSetupStepView(3, {
        ...state,
        joinGateEnabled: state.joinGateEnabled ?? true,
        minAgeHours: parsedAge.value!,
      }),
    );
  },
});
