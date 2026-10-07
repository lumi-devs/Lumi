import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";
import { clearStaleConfigRefs } from "../services/config-cleanup.js";

export const channelDeleteListener = defineListener({
  name: "channelDeleteListener",
  event: Events.ChannelDelete,
  async execute(
    services: Container,
    channel: DMChannel | NonThreadGuildBasedChannel,
  ): Promise<void> {
    const guild = "guild" in channel ? channel.guild : null;
    if (!guild) return;
    try {
      await clearStaleConfigRefs(services, guild.id, channel.id, "channel");
    } catch (err: unknown) {
      services.logger.warn(
        `[ConfigCleanup] Channel cleanup for ${channel.id} failed:`,
        err,
      );
    }
  },
});
