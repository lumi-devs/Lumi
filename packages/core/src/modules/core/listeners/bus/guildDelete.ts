import { Listener, Events } from "@sapphire/framework";
import { evictGuildRedisState } from "#lib/database/guild-eviction.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Guild } from "discord.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildDelete })
export class GuildDeleteEventBusListener extends Listener<
  typeof Events.GuildDelete
> {
  public override async run(guild: Guild) {
    // discord.js also fires this event when a Discord outage makes a guild
    // temporarily unavailable (`guild.available === false`) - only a
    // hydrated guild (`available === true`) means the bot was actually
    // removed, so only that branch counts as a real departure.
    if (!guild.available) return;

    await this.container.db.markGuildLeft(guild.id);

    await evictGuildRedisState(
      this.container.redis,
      this.container.invalidation,
      this.container.logger,
      guild.id,
      "GuildDelete",
    );

    const filterSvc = tryGetUtility("filter");
    filterSvc?.evict(guild.id);
  }
}
