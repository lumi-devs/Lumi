import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Message, PartialMessage } from "discord.js";
import { LumiEvents } from "#lib/types/common.js";

@ApplyOptions<Listener.Options>({ event: Events.MessageUpdate })
export class GuildUserMessageEditRouterListener extends Listener<
  typeof Events.MessageUpdate
> {
  public run(_old: Message | PartialMessage, updated: Message): void {
    if (updated.webhookId !== null) return;
    if (updated.system) return;
    if (updated.author.bot) return;
    if (!updated.inGuild()) return;
    this.container.client.emit(LumiEvents.GuildUserMessageEdit, updated);
  }
}
