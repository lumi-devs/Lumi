import { Events } from "discord.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { Container } from "@lib/Services.js";
import { evictGuildRedisState } from "@redis/GuildEviction.js";
import { tryGetUtility } from "@module-system/Utility.js";
import type { Guild } from "discord.js";

export const guildDeleteEventBusListener = defineListener({
  name: "guildDeleteEventBusListener",
  event: Events.GuildDelete,
  async execute(services: Container, guild: Guild) {

    if (!guild.available) return;

    await services.db.markGuildLeft(guild.id);

    await evictGuildRedisState(
      services.redis,
      services.invalidation,
      services.logger,
      guild.id,
      "GuildDelete",
    );

    const filterSvc = tryGetUtility("filter");
    filterSvc?.evict(guild.id);
  },
});
