import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import type { Guild } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { makeWarningCard } from "#lib/ui/cards.js";
import {
  getServerLockState,
  shouldLeaveOnJoin,
} from "../services/server-lock.js";
import { resolveAnnounceChannel } from "../services/global-announce.js";

async function leaveWhenLocked(
  services: Container,
  guild: Guild,
): Promise<void> {
  let locked = false;
  try {
    locked = shouldLeaveOnJoin(
      await getServerLockState(services.db),
      guild.id,
    );
  } catch (err: unknown) {
    services.logger.warn(
      "[ServerLock] State lookup failed, staying in guild:",
      err,
    );
    return;
  }
  if (!locked) return;

  try {
    const channel = resolveAnnounceChannel(guild);
    await channel?.send(
      makeWarningCard(
        `${Emojis.Lock} Leaving Server`,
        "Server lock is enabled, so the bot cannot stay in new servers.",
      ),
    );
  } catch (err: unknown) {
    services.logger.debug(
      `[ServerLock] Leave notice for ${guild.id} failed:`,
      err,
    );
  }

  try {
    await guild.leave();
    services.logger.info(
      `[ServerLock] ${Emojis.Lock} Left locked guild ${guild.name} (${guild.id})`,
    );
  } catch (err: unknown) {
    services.logger.warn(
      `[ServerLock] Failed to leave locked guild ${guild.id}:`,
      err,
    );
  }
}

export const guildCreateListener = defineListener({
  name: "guildCreateListener",
  event: Events.GuildCreate,
  async execute(services: Container, guild: Guild) {
    services.logger.info(
      `[Guild] ${Emojis.Guild} Joined: ${guild.name} (${guild.id}) - ${guild.memberCount} members`,
    );
    await services.db.markGuildRejoined(guild.id);
    await services.db.permissions.ensureBuiltinPermits(guild.id);
    await leaveWhenLocked(services, guild);
  },
});
