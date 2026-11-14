import type {RedisClient} from "@redis/Cluster.js";
import {scanKeysSafe} from "@redis/Cluster.js";
import { RedisKeys } from "@redis/Store.js";
import type { InvalidationBus } from "@redis/Store.js";
import type { ILogger } from "@shared/Index.ts";

const SCAN_COUNT = 500;

const MODULE_LOCAL_PATTERNS = (guildId: string): string[] => [

  `lumi:sticky:${guildId}:*`,

  `lumi:afk:${guildId}:*`,
];

async function scanPatternSafe(
  redis: RedisClient,
  logger: ILogger,
  logPrefix: string,
  pattern: string,
): Promise<string[]> {
  try {
    return await scanKeysSafe(redis, pattern, SCAN_COUNT);
  } catch (err: unknown) {
    logger.warn(`[${logPrefix}] Redis SCAN failed for pattern ${pattern}:`, err);
    return [];
  }
}
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
    RedisKeys.guildAllModuleConfigs(guildId),
    RedisKeys.restGuild(guildId),
    RedisKeys.restGuildRoles(guildId),
    RedisKeys.restGuildChannels(guildId),
    RedisKeys.verifyPending(guildId),
    RedisKeys.panicState(guildId),
    RedisKeys.recentJoiners(guildId),
    RedisKeys.joinBurst(guildId),
    RedisKeys.raidMode(guildId),
    RedisKeys.securityRestorePending(guildId),
    RedisKeys.logClaimIndex(guildId),
    RedisKeys.filterHeatPanicRaiders(guildId),
    RedisKeys.filterHeatPanicActive(guildId),
    RedisKeys.filterMentionWindow(guildId),
    RedisKeys.filterAutoLockdown(guildId),
  ];

  const patterns = [

    RedisKeys.guildConfig("*", guildId),
    RedisKeys.moduleEnabled("*", guildId),

    RedisKeys.moduleData(guildId, "*", "*", "*"),
    `lumi:kvcache:${guildId}:*`,
    `lumi:allow:${guildId}:*`,

    RedisKeys.guildPermitsPattern(guildId),
    RedisKeys.permOverrides("*", guildId),
    RedisKeys.blocked(guildId, "*"),

    RedisKeys.restMember(guildId, "*"),
    RedisKeys.restGuildMembersSample(guildId, 0).replace(/:0$/, ":*"),

    RedisKeys.channelIgnored(guildId, "*"),
    RedisKeys.logClaim(guildId, "*"),
    RedisKeys.logClaimCode(guildId, "*"),

    RedisKeys.quarantineState(guildId, "*"),
    RedisKeys.voiceMuteState(guildId, "*"),
    RedisKeys.securityWindow(guildId, "*", "*"),
    RedisKeys.securityTripped(guildId, "*", "*"),
    RedisKeys.verifyChallenge(guildId, "*"),
    RedisKeys.filterHeat(guildId, "*"),
    RedisKeys.filterHeatActed(guildId, "*"),
    RedisKeys.filterLastMsg(guildId, "*"),
    RedisKeys.filterHeatViolations(guildId, "*"),
    RedisKeys.filterHeatPanicFlagged(guildId, "*"),

    RedisKeys.rpcIdempotency("*", guildId, "*"),
    RedisKeys.featureFlagOverride("*", guildId),
  ];

  const dynamicKeys = (
    await Promise.all(
      [...patterns, ...MODULE_LOCAL_PATTERNS(guildId)].map((pattern) =>
        scanPatternSafe(redis, logger, logPrefix, pattern),
      ),
    )
  ).flat();

  const allKeys = [...staticKeys, ...dynamicKeys];
  if (allKeys.length) {
    await invalidation
      .invalidate(...allKeys)
      .catch((err: unknown) =>
        logger.warn(`[${logPrefix}] Redis eviction failed:`, err),
      );
  }
}

