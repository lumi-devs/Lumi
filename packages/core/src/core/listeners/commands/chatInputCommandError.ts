import {
  Listener,
  Events,
  type ChatInputCommandErrorPayload,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { errorCard, respond } from "#utilities/command-response.js";

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandError })
export class ChatInputCommandErrorListener extends Listener<
  typeof Events.ChatInputCommandError
> {
  public async run(
    error: unknown,
    { interaction, command }: ChatInputCommandErrorPayload,
  ) {
    const { card } = errorCard(`Command:${command.name}`, error);
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
