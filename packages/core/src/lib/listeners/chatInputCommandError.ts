import {
  Listener,
  type ChatInputCommandErrorPayload,
} from "@sapphire/framework";
import { makeErrorCard } from "#lib/utilities/cards.js";
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
    this.container.logger.error(`[ChatInputCommandError] command=${payload.command.name}:`, error);

    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred while executing this command.";

    const card = makeErrorCard(
      "Command Error",
      `An error occurred while running **/${payload.command.name}**:\n\n\`\`\`\n${errorMessage}\n\`\`\``,
    );

    await sendInteractionReply(interaction, card, "edit").catch(() => null);
  }
}
