import type { ValkeyClient } from "#lib/database/cluster-safe.js";
import { scanKeysSafe } from "#lib/database/cluster-safe.js";
import { ValkeyKeys, type InvalidationBus } from "#lib/database/valkey.js";
import type { ILogger } from "@sapphire/framework";

/**
 * Evicts every Valkey key a guild's config/module-enabled cache can occupy.
 * Shared by the real-time `guildDelete` listener and the retention sweep's
 * defensive re-eviction, so the key/pattern list only lives in one place.
 */
export async function evictGuildValkeyState(
  valkey: ValkeyClient,
  invalidation: InvalidationBus,
  logger: ILogger,
  guildId: string,
  logPrefix: string,
): Promise<void> {
  const staticKeys = [
    ValkeyKeys.guildSettings(guildId),
    ValkeyKeys.guildIgnored(guildId),
  ];

  const patterns = [
    `lumi:cfg:*:guild:${guildId}`,
    `lumi:module:enabled:*:${guildId}`,
  ];

  const dynamicKeys: string[] = [];
  for (const pattern of patterns) {
    try {
      dynamicKeys.push(...(await scanKeysSafe(valkey, pattern)));
    } catch (err: unknown) {
      logger.warn(`[${logPrefix}] Valkey SCAN failed for pattern ${pattern}:`, err);
    }
  }

  const allKeys = [...staticKeys, ...dynamicKeys];
  if (allKeys.length) {
    await invalidation
      .invalidate(...allKeys)
      .catch((err: unknown) =>
        logger.warn(`[${logPrefix}] Valkey eviction failed:`, err),
      );
  }
}

// Deprecated alias — remove after callers migrate.

