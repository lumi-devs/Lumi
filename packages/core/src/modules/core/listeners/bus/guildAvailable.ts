import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Guild } from "discord.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildAvailable })
export class GuildAvailableEventBusListener extends Listener<
  typeof Events.GuildAvailable
> {
  public override run(guild: Guild) {
    if (!this.container.rabbit) return;
    void this.container.rabbit.publishEvent("GUILD_AVAILABLE", {
      guildId: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      availableAt: Date.now(),
    });
  }
}
