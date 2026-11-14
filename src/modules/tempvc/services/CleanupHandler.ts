import { tryGetUtility } from "@module-system/Utility.js";
import type { Container } from "@lib/Services.js";
import type { TempVcCleanupPayload } from "@modules/tempvc/tasks/Cleanup.js";

export async function handleTempVcCleanupFire(
  services: Container,
  payload: TempVcCleanupPayload,
): Promise<void> {
  const service = tryGetUtility("tempvc");
  if (!service) return;
  await service.runCleanup(services, payload);
}
