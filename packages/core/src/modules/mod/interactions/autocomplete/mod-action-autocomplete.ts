import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandlerTypes } from "@sapphire/framework";
import type { AutocompleteInteraction } from "discord.js";
import {
  LumiAutocompleteHandler,
  LumiInteractionHandler,
} from "#lib/discord-adapter/LumiInteractionHandler.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";

const VALID_ACTIONS = [
  "warn",
  "mute",
  "kick",
  "ban",
  "softban",
  "unban",
  "unmute",
  "quarantine",
];

@ApplyOptions<LumiInteractionHandler.Options>({
  name: "mod-action-autocomplete",
  interactionHandlerType: InteractionHandlerTypes.Autocomplete,
  module: "mod",
})
export class ModActionAutocompleteHandler extends LumiAutocompleteHandler<{
  focused: string;
}> {
  public override parse(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== "action") return this.none();

    return this.some({ focused: focusedOption.value });
  }

  public override async run(
    interaction: AutocompleteInteraction,
    { focused }: { focused: string },
  ): Promise<void> {
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (!guildId) return;
    if (!(await isModuleEnabled(guildId, "mod"))) return;

    const filtered = filterAutocompleteChoices(VALID_ACTIONS, focused);
    await respondWithChoices(interaction, filtered, (choice) => choice.toUpperCase());
  }
}
