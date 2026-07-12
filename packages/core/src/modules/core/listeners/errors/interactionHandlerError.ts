import {
  Listener,
  Events,
  type InteractionHandlerError,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { RepliableInteraction } from "discord.js";
import { errorCard, respond } from "#lib/utilities/command-response.js";

@ApplyOptions<Listener.Options>({ event: Events.InteractionHandlerError })
export class InteractionHandlerErrorListener extends Listener<
  typeof Events.InteractionHandlerError
> {
  public async run(error: unknown, payload: InteractionHandlerError) {
    const { card } = errorCard(
      `InteractionHandler:${payload.handler.name}`,
      error,
    );
    if ("interaction" in payload && payload.interaction.isRepliable()) {
      await respond(payload.interaction as RepliableInteraction, card);
    }
  }
}
