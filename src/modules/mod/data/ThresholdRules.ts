import type { Container } from "#src/lib/Services.js";
import type { WarnThresholdAction } from "#src/contracts/rpc/Index.ts";

export type ThresholdAction = WarnThresholdAction;

export const thresholdKey = (guildId: string) =>
  `lumi:mod:${guildId}:thresholds`;

export async function invalidateThresholds(
  container: Container,
  guildId: string,
): Promise<void> {
  await container.invalidation.invalidate(thresholdKey(guildId));
}

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
