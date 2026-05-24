import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Guild } from "discord.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class GuildJoinEventBusListener extends Listener<
  typeof Events.GuildCreate
> {
  public override run(guild: Guild) {
    this.container.logger.info(
      `[EventBus] ${EmberEmojis.GUILD} GUILD_JOIN: ${guild.name} (${guild.id}) — ${guild.memberCount} members`,
    );
    if (!this.container.rabbit) return;
    void this.container.rabbit.publishEvent("GUILD_JOIN", {
      guildId: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      joinedAt: Date.now(),
    });
  }
}
