import {
  Listener,
  type ChatInputCommandDeniedPayload,
  type UserError,
} from "@sapphire/framework";
import { makeErrorCard } from "#lib/utilities/cards.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";

export class CoreChatInputCommandDeniedListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: "chatInputCommandDenied",
    });
  }

  public async run(error: UserError, payload: ChatInputCommandDeniedPayload): Promise<void> {
    const { interaction } = payload;
    const card = makeErrorCard(
      "Permission Denied",
      error.message || "You do not have permission to execute this command.",
    );

    await sendInteractionReply(interaction, card, "edit").catch(() => null);
  }
}
