import { tryGetService } from "#lib/module-system/Service.js";
import type { TempVcCleanupPayload } from "../scheduled-tasks/cleanup.js";

export async function handleTempVcCleanupFire(
  payload: TempVcCleanupPayload,
): Promise<void> {
  const service = tryGetService("tempvc");
  if (!service) return;
  await service.runCleanup(payload);
}
