import {
  Listener,
  Events,
  type ChatInputCommandErrorPayload,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { cardFor, respond } from "./_shared.js";

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandError })
export class ChatInputCommandErrorListener extends Listener<
  typeof Events.ChatInputCommandError
> {
  public async run(
    error: unknown,
    { interaction, command }: ChatInputCommandErrorPayload,
  ) {
    const { card, expected } = cardFor(error);
    if (!expected)
      this.container.logger.error(`[Command:${command.name}]`, error);
    try {
      await respond(interaction, card);
    } catch (err: unknown) {
      this.container.logger.error(
        `[Command:${command.name}] Failed to send error card:`,
        err,
      );
    }
  }
}
