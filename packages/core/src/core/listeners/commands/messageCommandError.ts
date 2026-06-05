import {
  Listener,
  Events,
  type MessageCommandErrorPayload,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { errorCard, respondMessage } from "#utilities/command-response.js";

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandError })
export class MessageCommandErrorListener extends Listener<
  typeof Events.MessageCommandError
> {
  public async run(
    error: unknown,
    { message, command }: MessageCommandErrorPayload,
  ) {
    const { card } = errorCard(`MessageCommand:${command.name}`, error);
    try {
      await respondMessage(message, card);
    } catch (err: unknown) {
      this.container.logger.error(
        `[MessageCommand:${command.name}] Failed to send error card:`,
        err,
      );
    }
  }
}
