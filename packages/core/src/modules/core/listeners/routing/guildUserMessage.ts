import { Events } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import type { Container } from "@lumi/lib/services.js";
import type { Message } from "discord.js";
import { LumiEvents } from "@lumi/lib/types/common.js";

export const guildUserMessageRouterListener = defineListener({
  name: "guildUserMessageRouterListener",
  event: Events.MessageCreate,
  async execute(services: Container, message: Message): Promise<void> {
    if (message.partial) {
      const full = await message.fetch().catch(() => null);
      if (!full) return;
      message = full;
    }
    if (message.webhookId !== null) return;
    if (message.system) return;
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    services.client.emit(LumiEvents.GuildUserMessage, message);
  },
});
