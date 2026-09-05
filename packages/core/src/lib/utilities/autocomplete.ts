import type { AutocompleteInteraction } from "discord.js";

/** Discord caps autocomplete responses at 25 choices. */
export const AutocompleteChoiceLimit = 25;
const ChoiceTextMaxLength = 100;

export function filterAutocompleteChoices(
  values: string[],
  focused: string,
  limit = AutocompleteChoiceLimit,
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
  label?: (value: string) => string,
): Promise<void> {
  await interaction.respond(
    values.map((value) => ({
      name: (label ? label(value) : value).slice(0, ChoiceTextMaxLength),
      value: value.slice(0, ChoiceTextMaxLength),
    })),
  );
}
