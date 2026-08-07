import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  container,
} from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { isWarnThresholdAction } from "@lumi/contracts";
import { ephemeralCard, makeErrorCard } from "#lib/utilities/cards.js";
import {
  removeThresholdRule,
  resetAllThresholds,
  saveThresholds,
  setThresholdRule,
} from "../lib/thresholds.js";
import { updateWarnThresholdsPanel } from "../lib/warn-thresholds-panel.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class WarnThresholdsButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("wt:")) return this.none();
    return this.some({ customId: interaction.customId });
  }

  public async run(
    interaction: ButtonInteraction,
    parsed: { customId: string },
  ): Promise<void> {
    await interaction.deferUpdate();
    const parts = parsed.customId.replace("wt:", "").split(":");
    const subAction = parts[0];
    const guildId = interaction.guildId!;

    let selectedCount = 3;
    let selectedAction = "mute";
    let selectedDuration = "1h";

    if (subAction === "save_rule") {
      const count = Number(parts[1] || 3);
      const action = parts[2] || "mute";
      const duration = parts[3] || undefined;

      if (!isWarnThresholdAction(action)) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Unknown Action",
              `\`${action}\` is not an escalation action Lumi can apply.`,
            ),
          ),
        );
        return;
      }

      try {
        await setThresholdRule(container, guildId, count, action, duration);
      } catch (err) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Rule Not Saved",
              err instanceof Error ? err.message : "The rule could not be saved.",
            ),
          ),
        );
        return;
      }

      selectedCount = count;
      selectedAction = action;
      selectedDuration = duration ?? "";
    } else if (subAction === "remove_rule") {
      const count = Number(parts[1] || 3);
      await removeThresholdRule(container, guildId, count);
      selectedCount = count;
    } else if (subAction === "preset_standard") {
      await saveThresholds(container, guildId, {
        "3": { action: "mute", duration: "1h" },
        "5": { action: "kick" },
        "10": { action: "ban" },
      });
    } else if (subAction === "clear_all") {
      await resetAllThresholds(container, guildId);
    }

    await updateWarnThresholdsPanel(interaction, {
      selectedCount,
      selectedAction,
      selectedDuration,
    });
  }
}
