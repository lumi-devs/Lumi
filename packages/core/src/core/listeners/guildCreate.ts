import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Guild } from "discord.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class GuildCreateListener extends Listener<typeof Events.GuildCreate> {
  public async run(guild: Guild) {
    this.container.logger.info(
      `[Guild] ${EmberEmojis.GUILD} Joined: ${guild.name} (${guild.id}) — ${guild.memberCount} members`,
    );
    await this.container.db.config.getGuildSettings(guild.id);
  }
}
