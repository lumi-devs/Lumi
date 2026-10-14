import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { Events, type Guild } from "discord.js";
import type { Container } from "#src/lib/Services.js";

export const guildDeleteEventBusListener = defineListener({
  name: "guildDeleteEventBusListener",
  event: Events.GuildDelete,
  async execute(services: Container, _guild: Guild): Promise<void> {
    services.cache.clear();
  },
});
