import {
  Listener,
  type ChatInputCommandErrorPayload,
} from "@sapphire/framework";
import { ephemeralCard, makeErrorCard } from "#lib/utilities/cards.js";
import { resolveCommandError } from "#lib/utilities/command-errors.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";

export class CoreChatInputCommandErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: "chatInputCommandError",
    });
  }

  public async run(error: unknown, payload: ChatInputCommandErrorPayload): Promise<void> {
    const { interaction } = payload;
    const label = `Command:${payload.command.name}`;
    const { title, message } = resolveCommandError(label, error);

    const card = ephemeralCard(makeErrorCard(title, message));
    const mode = interaction.deferred || interaction.replied ? "edit" : "followUp";
    await sendInteractionReply(interaction, card, mode).catch((err) => {
      this.container.logger.debug("[ChatInputCommandError] Failed to send error card:", err);
    });
  }
}
