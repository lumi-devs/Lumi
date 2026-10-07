import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import type { Message } from "discord.js";
import { LumiEvents } from "#lib/types/common.js";

export const guildUserMessageRouterListener = defineListener({
  name: "guildUserMessageRouterListener",
  event: Events.MessageCreate,
  execute(services: Container, message: Message): void {
    if (message.webhookId !== null) return;
    if (message.system) return;
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    services.client.emit(LumiEvents.GuildUserMessage, message);
  },
});
