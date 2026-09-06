import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import {
  VerificationModes,
  emptySetupState,
  hasSetupAccess,
  setupAccessDenied,
  stateFromSegments,
} from "#modules/core/lib/setup-wizard.js";
import { buildSetupStepView } from "#modules/core/ui/setup-wizard.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { AnySelectMenuInteraction } from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "setup-wizard-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class SetupWizardSelectHandler extends BaseInteractionHandler {
  public override parse(interaction: AnySelectMenuInteraction) {
    if (!interaction.customId.startsWith("setup:step:")) return this.none();
    const parts = interaction.customId.split(":");
    const tail = parts[parts.length - 1];
    if (tail !== "ch" && tail !== "vmode") return this.none();
    return this.some({ tail, parts });
  }

  public async run(
    interaction: AnySelectMenuInteraction,
    { tail, parts }: { tail: string; parts: string[] },
  ) {
    if (!interaction.inGuild()) return;
    await this.acknowledge(interaction);
    if (!hasSetupAccess(interaction)) throw setupAccessDenied();

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
  }
}
