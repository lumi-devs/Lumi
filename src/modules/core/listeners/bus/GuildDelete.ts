import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { evictGuildValkeyState } from "#src/lib/valkey/GuildEviction.js";
import { tryGetUtility } from "#src/lib/module-system/Utility.js";
import type { Guild } from "discord.js";

export const guildDeleteEventBusListener = defineListener({
  name: "guildDeleteEventBusListener",
  event: Events.GuildDelete,
  async execute(services: Container, guild: Guild) {

    if (!guild.available) return;

    await services.db.markGuildLeft(guild.id);

    await evictGuildValkeyState(
      services.valkey,
      services.invalidation,
      services.logger,
      guild.id,
      "GuildDelete",
    );

    const filterSvc = tryGetUtility("filter");
    filterSvc?.evict(guild.id);
  },
});
