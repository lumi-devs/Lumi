import { Listener, Events } from "@sapphire/framework";
import { tryGetService } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Guild } from "discord.js";
import { RedisKeys } from "#database/redis.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildDelete })
export class GuildDeleteEventBusListener extends Listener<
  typeof Events.GuildDelete
> {
  public override async run(guild: Guild) {
    if (!guild.available) return;

    // Evict all guild-scoped Redis cache keys so stale data doesn't persist.
    // Postgres rows are kept — data is preserved if the bot is reinvited.
    // Note: guildConfig and moduleEnabled use wildcard patterns and must be
    // found via SCAN before deleting — redis.del() does not glob-match.
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
      // Route through the InvalidationBus (not a raw redis.del) so peer
      // processes drop any in-process memos too — e.g. the FilterService
      // matcher evicted below lives on every replica.
      await this.container.invalidation
        .invalidate(...allKeys)
        .catch((err: unknown) =>
          this.container.logger.warn(
            "[GuildDelete] Redis eviction failed:",
            err,
          ),
        );
    }

    // Evict in-process FilterService Aho-Corasick matcher for this guild
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
