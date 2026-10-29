import { asIdList, isSnowflake } from "@lumi/foundation";
import { ModerationConfigKey } from "./constants.js";

type WarnAction = "timeout" | "kick" | "ban";

interface WarnThreshold {
  action: WarnAction;
  duration: number | null;
}

export interface ModerationConfig {
  quarantineRoleId: string | null;
  maxTargets: number;
  immuneRoleIds: string[];
  warnThresholds: Record<string, WarnThreshold>;
}

const ModerationDefaults: ModerationConfig = {
  quarantineRoleId: null,
  maxTargets: 10,
  immuneRoleIds: [],
  warnThresholds: {},
};

function asThresholds(value: unknown): Record<string, WarnThreshold> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const thresholds: Record<string, WarnThreshold> = {};
  for (const [key, entry] of Object.entries(value)) {
    const count = Number.parseInt(key, 10);
    if (!Number.isInteger(count) || count < 1) continue;
    if (typeof entry !== "object" || entry === null) continue;

    const { action, duration } = entry as {
      action?: unknown;
      duration?: unknown;
    };
    if (action !== "timeout" && action !== "kick" && action !== "ban") {
      continue;
    }
    const seconds =
      typeof duration === "number" && Number.isFinite(duration)
        ? Math.max(60, Math.floor(duration))
        : null;

    thresholds[String(count)] = {
      action,
      duration: action === "timeout" ? (seconds ?? 60) : null,
    };
  }
  return thresholds;
}

export async function getModerationConfig(
  services: { config: { get(guildId: string, name: string): Promise<unknown> } },
  guildId: string,
): Promise<ModerationConfig> {
  const stored =
    ((await services.config.get(guildId, ModerationConfigKey)) ??
      {}) as Record<string, unknown>;
  const quarantineRoleId = stored.quarantineRoleId;
  const maxTargets = stored.maxTargets;

  return {
    quarantineRoleId: isSnowflake(quarantineRoleId) ? quarantineRoleId : null,
    maxTargets:
      typeof maxTargets === "number" && Number.isFinite(maxTargets)
        ? Math.min(100, Math.max(1, Math.floor(maxTargets)))
        : ModerationDefaults.maxTargets,
    immuneRoleIds: asIdList(stored.immuneRoleIds, { unique: true }),
    warnThresholds: asThresholds(stored.warnThresholds),
  };
}
