import { ApplyOptions } from "@sapphire/decorators";
import { container, Events } from "@sapphire/framework";
import type { Guild } from "discord.js";
import { ModuleListener } from "lumi";

@ApplyOptions<ModuleListener.Options>({
  name: "hello-world-guild-create",
  event: Events.GuildCreate,
  module: "hello-world",
})
export default class GuildCreateListener extends ModuleListener<typeof Events.GuildCreate> {
  // The base ModuleListener.resolveGuildId() looks for `first.guildId` or
  // `first.guild.id`, which fits events like MessageCreate. GuildCreate's
  // first argument *is* the Guild, so its own `.id` is the guild ID.
  protected override resolveGuildId(guild: Guild): string | null {
    return guild.id;
  }

  protected async handle(guild: Guild): Promise<void> {
    const channel = guild.systemChannel ?? guild.channels.cache.find((c) => c.isTextBased());
    if (!channel?.isSendable()) return;

    try {
      await channel.send("👋 Thanks for adding **Hello World**! Try `/hello` to get started.");
    } catch (error) {
      // Missing permissions / deleted channel between the check and the send -
      // don't let a single failed welcome message crash the listener.
      container.logger.warn(`[hello-world] Failed to send welcome message in ${guild.id}:`, error);
    }
  }
}
