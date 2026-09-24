import type { RedisClient } from "#lib/database/cluster-safe.js";
import { scanKeysSafe } from "#lib/database/cluster-safe.js";
import { RedisKeys, type InvalidationBus } from "#lib/database/redis.js";
import type { ILogger } from "@sapphire/framework";

/**
 * Evicts every Redis key a guild's config/module-enabled cache can occupy.
 * Shared by the real-time `guildDelete` listener and the retention sweep's
 * defensive re-eviction, so the key/pattern list only lives in one place.
 */
export async function evictGuildRedisState(
  redis: RedisClient,
  invalidation: InvalidationBus,
  logger: ILogger,
  guildId: string,
  logPrefix: string,
): Promise<void> {
  const staticKeys = [
    RedisKeys.guildSettings(guildId),
    RedisKeys.guildIgnored(guildId),
  ];

  const patterns = [
    `lumi:cfg:*:guild:${guildId}`,
    `lumi:module:enabled:*:${guildId}`,
  ];

  const dynamicKeys: string[] = [];
  for (const pattern of patterns) {
    try {
      dynamicKeys.push(...(await scanKeysSafe(redis, pattern)));
    } catch (err: unknown) {
      logger.warn(`[${logPrefix}] Redis SCAN failed for pattern ${pattern}:`, err);
    }
  }

  const allKeys = [...staticKeys, ...dynamicKeys];
  if (allKeys.length) {
    await invalidation
      .invalidate(...allKeys)
      .catch((err: unknown) =>
        logger.warn(`[${logPrefix}] Redis eviction failed:`, err),
      );
  }
}
