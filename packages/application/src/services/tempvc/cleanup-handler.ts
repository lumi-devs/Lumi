import { tryGetUtility } from "#lib/module-system/Utility.js";
import type { Container } from "#lib/services.js";
import type { TempVcCleanupPayload } from "#modules/tempvc/scheduled-tasks/cleanup.js";

export async function handleTempVcCleanupFire(
  services: Container,
  payload: TempVcCleanupPayload,
): Promise<void> {
  const service = tryGetUtility("tempvc");
  if (!service) return;
  await service.runCleanup(services, payload);
}
