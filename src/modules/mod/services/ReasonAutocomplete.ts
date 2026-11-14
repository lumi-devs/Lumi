import type { AutocompleteInteraction } from "discord.js";
import { container } from "@lib/Services.js";
import {
  respondWithChoices,
  filterAutocompleteChoices,
} from "@utilities/Autocomplete.js";
import { toStringArray } from "@module-system/ConfigSchema.js";

const DefaultReasonPresets = [
  "⚠️ Ban evasion",
  "🤖 Compromised account",
  "🚫 NSFW content",
  "🎯 Raiding",
  "🔗 Scam links",
  "⛔ Self-botting",
  "📧 Spam",
  "💬 Toxicity/Harassment",
];

export async function respondWithReasonChoices(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "reason") {
    return respondWithChoices(interaction, []);
  }

  const guildId = interaction.guildId;
  const configured = guildId
    ? toStringArray(
        await container.db.config.getModuleConfig(
          guildId,
          "mod",
          "predefined_reasons",
        ),
      )
    : [];
  const presets = configured.length > 0 ? configured : DefaultReasonPresets;

  return respondWithChoices(
    interaction,
    filterAutocompleteChoices(presets, focused.value),
  );
}
