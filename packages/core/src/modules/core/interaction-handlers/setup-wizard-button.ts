import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import {
  emptySetupState,
  finishSetupWizard,
  hasSetupAccess,
  normalizeSetupState,
  setupAccessDenied,
  stateFromSegments,
} from "#modules/core/lib/setup-wizard.js";
import {
  buildSetupAgeModal,
  buildSetupReviewView,
  buildSetupStepView,
  buildSetupSuccessCard,
} from "#modules/core/ui/setup-wizard.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "setup-wizard-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class SetupWizardButtonHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("setup:")) return this.none();
    const parts = interaction.customId.split(":");
    const head = parts[1];
    if (head !== "step" && head !== "finish" && head !== "agebtn") {
      return this.none();
    }
    return this.some({ head, parts });
  }

  public async run(
    interaction: ButtonInteraction,
    { head, parts }: { head: string; parts: string[] },
  ) {
    if (!interaction.inGuild()) return;

    if (head === "agebtn") {
      if (!hasSetupAccess(interaction)) throw setupAccessDenied();
      return interaction.showModal(
        buildSetupAgeModal(stateFromSegments(parts.slice(2))),
      );
    }

    await this.acknowledge(interaction);
    if (!hasSetupAccess(interaction)) throw setupAccessDenied();
    const { guildId } = interaction;

    if (head === "finish") {
      const settled = normalizeSetupState(stateFromSegments(parts.slice(2)));
      await finishSetupWizard(guildId, settled, interaction.user.id);
      return interaction.editReply(buildSetupSuccessCard(settled));
    }

    const target = Number(parts[2]);
    const state = stateFromSegments(parts.slice(3));
    if (target === 2) return interaction.editReply(buildSetupStepView(2, state));
    if (target === 3) return interaction.editReply(buildSetupStepView(3, state));
    if (target === 4) {
      return interaction.editReply(
        buildSetupReviewView(normalizeSetupState(state)),
      );
    }
    return interaction.editReply(buildSetupStepView(1, emptySetupState()));
  }
}
