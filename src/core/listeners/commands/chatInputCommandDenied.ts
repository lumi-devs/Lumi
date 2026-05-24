import {
  Listener,
  Events,
  type UserError,
  type ChatInputCommandDeniedPayload,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { handleDenied } from "./_shared.js";

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandDenied })
export class ChatInputCommandDeniedListener extends Listener<
  typeof Events.ChatInputCommandDenied
> {
  public async run(error: UserError, payload: ChatInputCommandDeniedPayload) {
    return handleDenied(payload.interaction, error, payload);
  }
}
