import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";
import { clearStaleConfigRefs } from "../lib/config-cleanup.js";

@ApplyOptions<Listener.Options>({ event: Events.ChannelDelete })
export class ChannelDeleteListener extends Listener<
  typeof Events.ChannelDelete
> {
  public async run(
    channel: DMChannel | NonThreadGuildBasedChannel,
  ): Promise<void> {
    const guild = "guild" in channel ? channel.guild : null;
    if (!guild) return;
    try {
      await clearStaleConfigRefs(guild.id, channel.id, "channel");
    } catch (err: unknown) {
      this.container.logger.warn(
        `[ConfigCleanup] Channel cleanup for ${channel.id} failed:`,
        err,
      );
    }
  }
}
