import type { AutocompleteInteraction } from "discord.js";
import { container } from "@sapphire/framework";
import {
  respondWithChoices,
  filterAutocompleteChoices,
} from "#lib/utilities/autocomplete.js";
import { toStringArray } from "#lib/module-system/config-schema.js";

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

/**
 * Autocomplete for a command's `reason` option: suggests the guild's
 * configured `mod:predefined_reasons`, falling back to the built-in presets
 * when none are configured. Responds with an empty list for any other
 * focused option so a command can delegate its whole `autocompleteRun` here.
 */
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
