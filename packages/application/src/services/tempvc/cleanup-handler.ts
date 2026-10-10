import { tryGetUtility } from "@lumi/lib/module-system/utility.js";
import type { Container } from "@lumi/lib/services.js";
import type { TempVcCleanupPayload } from "@lumi/modules/tempvc/scheduled-tasks/cleanup.js";

export async function handleTempVcCleanupFire(
  services: Container,
  payload: TempVcCleanupPayload,
): Promise<void> {
  const service = tryGetUtility("tempvc");
  if (!service) return;
  await service.runCleanup(services, payload);
}
