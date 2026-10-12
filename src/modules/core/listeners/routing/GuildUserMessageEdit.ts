import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import type { Message, PartialMessage } from "discord.js";
import { LumiEvents } from "#src/lib/types/Common.js";

export const guildUserMessageEditRouterListener = defineListener({
  name: "guildUserMessageEditRouterListener",
  event: Events.MessageUpdate,
  execute(services: Container, _old: Message | PartialMessage, updated: Message): void {
    if (updated.webhookId !== null) return;
    if (updated.system) return;
    if (updated.author.bot) return;
    if (!updated.inGuild()) return;
    services.client.emit(LumiEvents.GuildUserMessageEdit, updated);
  },
});
