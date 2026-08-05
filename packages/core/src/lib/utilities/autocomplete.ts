import type { AutocompleteInteraction } from "discord.js";

/** Discord caps autocomplete responses at 25 choices. */
export const AUTOCOMPLETE_CHOICE_LIMIT = 25;
const CHOICE_TEXT_MAX_LENGTH = 100;

export function filterAutocompleteChoices(
  values: string[],
  focused: string,
  limit = AUTOCOMPLETE_CHOICE_LIMIT,
): string[] {
  const query = focused.trim().toLowerCase();
  const matches = query
    ? values.filter((value) => value.toLowerCase().includes(query))
    : values;
  return matches.slice(0, limit);
}

export async function respondWithChoices(
  interaction: AutocompleteInteraction,
  values: string[],
): Promise<void> {
  await interaction.respond(
    values.map((value) => ({
      name: value.slice(0, CHOICE_TEXT_MAX_LENGTH),
      value: value.slice(0, CHOICE_TEXT_MAX_LENGTH),
    })),
  );
}
