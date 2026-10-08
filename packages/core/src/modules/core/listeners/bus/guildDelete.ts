import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import { evictGuildValkeyState } from "#lib/valkey/guild-eviction.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import type { Guild } from "discord.js";

export const guildDeleteEventBusListener = defineListener({
  name: "guildDeleteEventBusListener",
  event: Events.GuildDelete,
  async execute(services: Container, guild: Guild) {
    // discord.js also fires this event when a Discord outage makes a guild
    // temporarily unavailable (`guild.available === false`) - only a
    // hydrated guild (`available === true`) means the bot was actually
    // removed, so only that branch counts as a real departure.
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
