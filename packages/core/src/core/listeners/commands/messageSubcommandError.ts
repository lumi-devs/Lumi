import { Listener } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  SubcommandPluginEvents,
  type MessageSubcommandErrorPayload,
} from "@sapphire/plugin-subcommands";
import { errorCard, respondMessage } from "#utilities/command-response.js";

@ApplyOptions<Listener.Options>({
  event: SubcommandPluginEvents.MessageSubcommandError,
})
export class MessageSubcommandErrorListener extends Listener<
  typeof SubcommandPluginEvents.MessageSubcommandError
> {
  public async run(
    error: unknown,
    { message, command }: MessageSubcommandErrorPayload,
  ) {
    const { card } = errorCard(`MessageSubcommand:${command.name}`, error);
    try {
      await respondMessage(message, card);
    } catch (err: unknown) {
      this.container.logger.error(
        `[MessageSubcommand:${command.name}] Failed to send error card:`,
        err,
      );
    }
  }
}
