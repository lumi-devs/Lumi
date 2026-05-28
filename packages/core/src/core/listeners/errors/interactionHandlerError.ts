import {
  Listener,
  Events,
  type InteractionHandlerError,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { RepliableInteraction } from "discord.js";
import { cardFor, respond } from "../commands/_shared.js";

@ApplyOptions<Listener.Options>({ event: Events.InteractionHandlerError })
export class InteractionHandlerErrorListener extends Listener<
  typeof Events.InteractionHandlerError
> {
  public async run(error: unknown, payload: InteractionHandlerError) {
    const { card, expected } = cardFor(error);
    if (!expected)
      this.container.logger.error(
        `[InteractionHandler:${payload.handler.name}]`,
        error,
      );
    if ("interaction" in payload && payload.interaction.isRepliable()) {
      await respond(payload.interaction as RepliableInteraction, card);
    }
  }
}
