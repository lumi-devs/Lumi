import {
  Listener,
  Events,
  type AutocompleteInteractionPayload,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";

@ApplyOptions<Listener.Options>({
  event: Events.CommandAutocompleteInteractionError,
})
export class CommandAutocompleteInteractionErrorListener extends Listener<
  typeof Events.CommandAutocompleteInteractionError
> {
  public run(error: unknown, { command }: AutocompleteInteractionPayload) {
    this.container.logger.error(`[Autocomplete:${command.name}]`, error);
  }
}
