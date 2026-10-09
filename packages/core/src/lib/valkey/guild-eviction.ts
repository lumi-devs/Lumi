import type { ValkeyClient } from "@lumi/infrastructure/database";
import { scanKeysSafe } from "@lumi/infrastructure/database";
import { ValkeyKeys } from "#lib/valkey/client.js";
import type { InvalidationBus } from "#lib/valkey/buses.js";
import type { ILogger } from "@lumi/shared";

/**
 * Evicts every Valkey key a guild's config/module-enabled cache can occupy.
 * Shared by the real-time `guildDelete` listener and the retention sweep's
 * defensive re-eviction, so the key/pattern list only lives in one place.
 *
 * Patterns are derived from the `ValkeyKeys` builders (wildcard segments via
 * `"*"`) rather than string literals, so they stay in sync with the
 * repositories' key shapes by construction. The two `MODULE_LOCAL_PATTERNS`
 * below are the deliberate exception: `sticky`/`afk` build their keys inside
 * their own modules (the zero cross-module import law forbids importing those
 * builders here), so they are covered by literal guild-scoped patterns.
 */

// SCAN COUNT hint per pattern: eviction walks whole guild families, and the
// default 100-key pages turn that into dozens of round trips per pattern.
const SCAN_COUNT = 500;

/** Module-local guild-scoped key shapes (no TTL or owner-driven eviction). */
const MODULE_LOCAL_PATTERNS = (guildId: string): string[] => [
  // `lumi:sticky:<guild>:<channel>` is written with no TTL and only deleted on
  // its explicit unset path, so a deleted guild would leak it forever.
  `lumi:sticky:${guildId}:*`,
  // `lumi:afk:<guild>:<user>` carries its own TTL, but evicting it here keeps
  // a re-created guild (same id) from reading the previous owner's AFK state.
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
    // Config + module state.
    ValkeyKeys.guildConfig("*", guildId),
    ValkeyKeys.moduleEnabled("*", guildId),
    // Per-guild module KV (`lumi:kv:<guild>:*`).
    ValkeyKeys.moduleData(guildId, "*", "*", "*"),
    // Permit + block state.
    ValkeyKeys.guildPermitsPattern(guildId),
    ValkeyKeys.permOverrides("*", guildId),
    ValkeyKeys.blocked(guildId, "*"),
    // REST entity cache (`lumi:rest:member:<guild>:*` plus the sampled
    // member-list keys `lumi:rest:guild:<guild>:members:*`, whose limit
    // segment has no builder-level wildcard).
    ValkeyKeys.restMember(guildId, "*"),
    ValkeyKeys.restGuildMembersSample(guildId, 0).replace(/:0$/, ":*"),
    // Ignore + logging claims.
    ValkeyKeys.channelIgnored(guildId, "*"),
    ValkeyKeys.logClaim(guildId, "*"),
    ValkeyKeys.logClaimCode(guildId, "*"),
    // Security / mod / filter windows keyed under the guild segment.
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
    // Dashboard RPC idempotency + per-guild flag overrides.
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

