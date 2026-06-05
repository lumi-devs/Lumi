import {
  Listener,
  Events,
  type UserError,
  type MessageCommandDeniedPayload,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { handleDenied } from "#utilities/command-response.js";

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandDenied })
export class MessageCommandDeniedListener extends Listener<
  typeof Events.MessageCommandDenied
> {
  public async run(error: UserError, payload: MessageCommandDeniedPayload) {
    return handleDenied(payload.message, error, payload);
  }
}
