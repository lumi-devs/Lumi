import type { Container } from "@sapphire/framework";
import type { WarnThresholdAction } from "@lumi/contracts/rpc";

export type ThresholdAction = WarnThresholdAction;

export const thresholdKey = (guildId: string) =>
  `lumi:mod:${guildId}:thresholds`;

export async function invalidateThresholds(
  container: Container,
  guildId: string,
): Promise<void> {
  await container.invalidation.invalidate(thresholdKey(guildId));
}

/**
 * `durationSeconds` is already validated and converted from the wire's
 * human-readable string at the RPC boundary (`mod/rpc.ts`) - this only
 * persists the storage-shaped value.
 */
export async function setThresholdRule(
  container: Container,
  guildId: string,
  count: number,
  action: ThresholdAction,
  durationSeconds?: number,
): Promise<void> {
  await container.db.moderation.setWarnThreshold({
    guildId,
    warnCount: count,
    action,
    duration: durationSeconds,
  });
  await invalidateThresholds(container, guildId);
}

export async function removeThresholdRule(
  container: Container,
  guildId: string,
  count: number,
): Promise<void> {
  await container.db.moderation.removeWarnThreshold(guildId, count);
  await invalidateThresholds(container, guildId);
}
