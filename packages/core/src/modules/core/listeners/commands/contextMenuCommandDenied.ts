import {
  Listener,
  Events,
  type UserError,
  type ContextMenuCommandDeniedPayload,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { handleDenied } from "#lib/utilities/command-response.js";
import { type RepliableInteraction } from "discord.js";

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandDenied })
export class ContextMenuCommandDeniedListener extends Listener<
  typeof Events.ContextMenuCommandDenied
> {
  public async run(error: UserError, payload: ContextMenuCommandDeniedPayload) {
    return handleDenied(
      payload.interaction as RepliableInteraction,
      error,
      payload,
    );
  }
}
