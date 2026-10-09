import {
  acknowledge,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import {
  VerificationModes,
  emptySetupState,
  hasSetupAccess,
  setupAccessDenied,
  stateFromSegments,
} from "../../services/setup-wizard.js";
import { buildSetupStepView } from "#modules/core/ui/setup-wizard.js";
import { SetupStepId } from "../../constants.js";
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
