import { tryGetUtility } from "#lib/module-system/Utility.js";
import type { TempVcCleanupPayload } from "#modules/tempvc/scheduled-tasks/cleanup.js";

export async function handleTempVcCleanupFire(
  payload: TempVcCleanupPayload,
): Promise<void> {
  const service = tryGetUtility("tempvc");
  if (!service) return;
  await service.runCleanup(payload);
}
