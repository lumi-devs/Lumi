import { Listener, Events } from "@sapphire/framework";
import { tryGetService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Guild } from "discord.js";
import { RedisKeys } from "#lib/database/redis.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildDelete })
export class GuildDeleteEventBusListener extends Listener<
  typeof Events.GuildDelete
> {
  public override async run(guild: Guild) {
    if (!guild.available) return;

    const staticKeys = [
      RedisKeys.guildSettings(guild.id),
      RedisKeys.guildPrefixes(guild.id),
      RedisKeys.guildIgnored(guild.id),
    ];

    const patterns = [
      `lumi:cfg:*:guild:${guild.id}`,
      `lumi:module:enabled:*:${guild.id}`,
    ];

    const dynamicKeys: string[] = [];
    for (const pattern of patterns) {
      try {
        let cursor = "0";
        do {
          const [next, found] = await this.container.redis.scan(
            cursor,
            "MATCH",
            pattern,
            "COUNT",
            100,
          );
          cursor = next;
          dynamicKeys.push(...found);
        } while (cursor !== "0");
      } catch (err: unknown) {
        this.container.logger.warn(
          `[GuildDelete] Redis SCAN failed for pattern ${pattern}:`,
          err,
        );
      }
    }

    const allKeys = [...staticKeys, ...dynamicKeys];
    if (allKeys.length) {
      await this.container.invalidation
        .invalidate(...allKeys)
        .catch((err: unknown) =>
          this.container.logger.warn(
            "[GuildDelete] Redis eviction failed:",
            err,
          ),
        );
    }

    const filterSvc = tryGetService("filter");
    filterSvc?.evict(guild.id);

    if (!this.container.rabbit) return;
    void this.container.rabbit.publishEvent("GUILD_LEAVE", {
      guildId: guild.id,
      name: guild.name,
      leftAt: Date.now(),
    });
  }
}
