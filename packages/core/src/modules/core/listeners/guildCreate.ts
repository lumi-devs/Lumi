import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Guild } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { makeWarningCard } from "#lib/utilities/cards.js";
import {
  getServerLockState,
  shouldLeaveOnJoin,
} from "#modules/core/lib/server-lock.js";
import { resolveAnnounceChannel } from "#modules/core/lib/global-announce.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class GuildCreateListener extends Listener<typeof Events.GuildCreate> {
  public async run(guild: Guild) {
    this.container.logger.info(
      `[Guild] ${Emojis.Guild} Joined: ${guild.name} (${guild.id}) - ${guild.memberCount} members`,
    );
    await this.container.db.config.getGuildSettings(guild.id);
    await this.container.db.permissions.ensureBuiltinPermits(guild.id);
    await this.leaveWhenLocked(guild);
  }

  private async leaveWhenLocked(guild: Guild): Promise<void> {
    let locked = false;
    try {
      locked = shouldLeaveOnJoin(
        await getServerLockState(this.container.db),
        guild.id,
      );
    } catch (err: unknown) {
      this.container.logger.warn(
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
      this.container.logger.debug(
        `[ServerLock] Leave notice for ${guild.id} failed:`,
        err,
      );
    }

    try {
      await guild.leave();
      this.container.logger.info(
        `[ServerLock] ${Emojis.Lock} Left locked guild ${guild.name} (${guild.id})`,
      );
    } catch (err: unknown) {
      this.container.logger.warn(
        `[ServerLock] Failed to leave locked guild ${guild.id}:`,
        err,
      );
    }
  }
}
