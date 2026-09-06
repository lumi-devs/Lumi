import {
  hasSetupAccess,
  parseMinAgeHours,
  stateFromSegments,
} from "#modules/core/lib/setup-wizard.js";
import { buildSetupStepView } from "#modules/core/ui/setup-wizard.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ModalSubmitInteraction } from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "setup-wizard-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class SetupWizardModalHandler extends InteractionHandler {
  public override parse(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith("setup:agemodal:")) {
      return this.none();
    }
    return this.some({ segments: interaction.customId.split(":").slice(2) });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    { segments }: { segments: string[] },
  ) {
    if (!interaction.inGuild()) return;
    await interaction.deferUpdate();

    if (!hasSetupAccess(interaction)) {
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
    const parsed = parseMinAgeHours(raw);
    if (parsed.error) {
      return interaction.followUp(ephemeralCard(makeErrorCard("Invalid Age", parsed.error)));
    }
    return interaction.editReply(
      buildSetupStepView(3, {
        ...state,
        joinGateEnabled: state.joinGateEnabled ?? true,
        minAgeHours: parsed.value!,
      }),
    );
  }
}
