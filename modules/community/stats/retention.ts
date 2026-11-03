import type { ModuleServices } from "@lumi/module-kit";
import { RetentionDays } from "./constants.js";
import { retentionCutoff } from "./ranges.js";

interface RetentionServices {
  helpers: Pick<ModuleServices["helpers"], "stats">;
}

export interface RetentionResult {
  snapshots: number;
  messageBuckets: number;
  voiceBuckets: number;
  events: number;
}

export async function purgeOldStats(
  services: RetentionServices,
  now: number = Date.now(),
): Promise<RetentionResult> {
  const cutoff = retentionCutoff(now, RetentionDays);
  return services.helpers.stats.purgeBefore(cutoff);
}
