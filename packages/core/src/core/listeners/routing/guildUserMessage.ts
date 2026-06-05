import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Message } from "discord.js";
import { LumiEvents } from "#lib/types.js";

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class GuildUserMessageRouterListener extends Listener<
  typeof Events.MessageCreate
> {
  public run(message: Message): void {
    if (!message.inGuild() || message.author.bot) return;
    this.container.client.emit(LumiEvents.GuildUserMessage, message);
  }
}
