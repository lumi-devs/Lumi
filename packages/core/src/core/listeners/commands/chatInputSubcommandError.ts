import { Listener } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  SubcommandPluginEvents,
  type ChatInputSubcommandErrorPayload,
} from "@sapphire/plugin-subcommands";
import { errorCard, respond } from "#utilities/command-response.js";

@ApplyOptions<Listener.Options>({
  event: SubcommandPluginEvents.ChatInputSubcommandError,
})
export class ChatInputSubcommandErrorListener extends Listener<
  typeof SubcommandPluginEvents.ChatInputSubcommandError
> {
  public async run(
    error: unknown,
    { interaction, command }: ChatInputSubcommandErrorPayload,
  ) {
    const { card } = errorCard(`Subcommand:${command.name}`, error);
    try {
      await respond(interaction, card);
    } catch (err: unknown) {
      this.container.logger.error(
        `[Subcommand:${command.name}] Failed to send error card:`,
        err,
      );
    }
  }
}
