import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { updateWarnThresholdsPanel } from "../lib/warn-thresholds-panel.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class WarnThresholdsSelectHandler extends InteractionHandler {
  public override parse(interaction: StringSelectMenuInteraction) {
    if (!interaction.customId.startsWith("wt:")) return this.none();
    return this.some({ customId: interaction.customId });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    parsed: { customId: string },
  ): Promise<void> {
    await interaction.deferUpdate();
    const parts = parsed.customId.replace("wt:", "").split(":");
    const subAction = parts[0];
    const value = interaction.values[0] ?? "";

    let selectedCount = Number(parts[1] || 3);
    let selectedAction = parts[2] || "mute";
    let selectedDuration = parts[3] || "1h";

    if (subAction === "select_count" || value.startsWith("count:")) {
      selectedCount = Number(value.replace("count:", ""));
    } else if (subAction === "select_action" || value.startsWith("action:")) {
      const chosen = value.replace("action:", "").split(":");
      selectedAction = chosen[0] ?? "mute";
      selectedDuration = chosen[1] ?? "";
    }

    await updateWarnThresholdsPanel(interaction, {
      selectedCount,
      selectedAction,
      selectedDuration,
    });
  }
}
