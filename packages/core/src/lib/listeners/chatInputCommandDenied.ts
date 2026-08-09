import {
  Listener,
  type ChatInputCommandDeniedPayload,
  type UserError,
} from "@sapphire/framework";
import { handleDenied } from "#lib/utilities/command-response.js";

export class CoreChatInputCommandDeniedListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: "chatInputCommandDenied",
    });
  }

  public async run(error: UserError, payload: ChatInputCommandDeniedPayload): Promise<void> {
    await handleDenied(payload.interaction, error, payload);
  }
}
