import type { Container } from "@sapphire/framework";
import { warnThresholdNeedsDuration, type WarnThresholdAction } from "@lumi/contracts";
import { parseDuration } from "#lib/utilities/time.js";

export type ThresholdAction = WarnThresholdAction;

export const thresholdKey = (guildId: string) =>
  `lumi:mod:${guildId}:thresholds`;

export async function invalidateThresholds(
  container: Container,
  guildId: string,
): Promise<void> {
  await container.invalidation.invalidate(thresholdKey(guildId));
}

export function normalizeRuleDuration(
  action: ThresholdAction,
  duration?: string | null,
): string | undefined {
  const trimmed = duration?.trim() || undefined;
  if (!warnThresholdNeedsDuration(action)) return undefined;
  if (!trimmed) {
    throw new Error(`A ${action} threshold needs a duration such as "1h".`);
  }
  if (!parseDuration(trimmed)) {
    throw new Error(
      `"${trimmed}" is not a duration Lumi understands - try a value such as "30m", "2h" or "7d".`,
    );
  }
  return trimmed;
}

export async function setThresholdRule(
  container: Container,
  guildId: string,
  count: number,
  action: ThresholdAction,
  duration?: string | null,
): Promise<void> {
  await container.db.moderation.setWarnThreshold({
    guildId,
    warnCount: count,
    action,
    duration: normalizeRuleDuration(action, duration),
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
