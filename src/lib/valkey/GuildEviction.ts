import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import {scanKeysSafe} from "#src/lib/valkey/Cluster.js";
import { ValkeyKeys } from "#src/lib/valkey/Store.js";
import type { InvalidationBus } from "#src/lib/valkey/Store.js";
import type { ILogger } from "#src/shared/Index.ts";

const SCAN_COUNT = 500;

const MODULE_LOCAL_PATTERNS = (guildId: string): string[] => [

  `lumi:sticky:${guildId}:*`,

  `lumi:afk:${guildId}:*`,
];

async function scanPatternSafe(
  valkey: ValkeyClient,
  logger: ILogger,
  logPrefix: string,
  pattern: string,
): Promise<string[]> {
  try {
    return await scanKeysSafe(valkey, pattern, SCAN_COUNT);
  } catch (err: unknown) {
    logger.warn(`[${logPrefix}] Valkey SCAN failed for pattern ${pattern}:`, err);
    return [];
  }
}
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
    ValkeyKeys.guildAllModuleConfigs(guildId),
    ValkeyKeys.restGuild(guildId),
    ValkeyKeys.restGuildRoles(guildId),
    ValkeyKeys.restGuildChannels(guildId),
    ValkeyKeys.verifyPending(guildId),
    ValkeyKeys.panicState(guildId),
    ValkeyKeys.recentJoiners(guildId),
    ValkeyKeys.joinBurst(guildId),
    ValkeyKeys.raidMode(guildId),
    ValkeyKeys.securityRestorePending(guildId),
    ValkeyKeys.logClaimIndex(guildId),
    ValkeyKeys.filterHeatPanicRaiders(guildId),
    ValkeyKeys.filterHeatPanicActive(guildId),
    ValkeyKeys.filterMentionWindow(guildId),
    ValkeyKeys.filterAutoLockdown(guildId),
  ];

  const patterns = [

    ValkeyKeys.guildConfig("*", guildId),
    ValkeyKeys.moduleEnabled("*", guildId),

    ValkeyKeys.moduleData(guildId, "*", "*", "*"),
    `lumi:kvcache:${guildId}:*`,
    `lumi:allow:${guildId}:*`,

    ValkeyKeys.guildPermitsPattern(guildId),
    ValkeyKeys.permOverrides("*", guildId),
    ValkeyKeys.blocked(guildId, "*"),

    ValkeyKeys.restMember(guildId, "*"),
    ValkeyKeys.restGuildMembersSample(guildId, 0).replace(/:0$/, ":*"),

    ValkeyKeys.channelIgnored(guildId, "*"),
    ValkeyKeys.logClaim(guildId, "*"),
    ValkeyKeys.logClaimCode(guildId, "*"),

    ValkeyKeys.quarantineState(guildId, "*"),
    ValkeyKeys.voiceMuteState(guildId, "*"),
    ValkeyKeys.securityWindow(guildId, "*", "*"),
    ValkeyKeys.securityTripped(guildId, "*", "*"),
    ValkeyKeys.verifyChallenge(guildId, "*"),
    ValkeyKeys.filterHeat(guildId, "*"),
    ValkeyKeys.filterHeatActed(guildId, "*"),
    ValkeyKeys.filterLastMsg(guildId, "*"),
    ValkeyKeys.filterHeatViolations(guildId, "*"),
    ValkeyKeys.filterHeatPanicFlagged(guildId, "*"),

    ValkeyKeys.rpcIdempotency("*", guildId, "*"),
    ValkeyKeys.featureFlagOverride("*", guildId),
  ];

  const dynamicKeys = (
    await Promise.all(
      [...patterns, ...MODULE_LOCAL_PATTERNS(guildId)].map((pattern) =>
        scanPatternSafe(valkey, logger, logPrefix, pattern),
      ),
    )
  ).flat();

  const allKeys = [...staticKeys, ...dynamicKeys];
  if (allKeys.length) {
    await invalidation
      .invalidate(...allKeys)
      .catch((err: unknown) =>
        logger.warn(`[${logPrefix}] Valkey eviction failed:`, err),
      );
  }
}

