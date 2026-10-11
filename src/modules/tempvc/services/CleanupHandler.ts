import { tryGetUtility } from "#src/lib/module-system/Utility.js";
import type { Container } from "#src/lib/Services.js";
import type { TempVcCleanupPayload } from "#src/modules/tempvc/tasks/Cleanup.js";

export async function handleTempVcCleanupFire(
  services: Container,
  payload: TempVcCleanupPayload,
): Promise<void> {
  const service = tryGetUtility("tempvc");
  if (!service) return;
  await service.runCleanup(services, payload);
}
