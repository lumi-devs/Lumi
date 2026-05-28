// Worker-side fire handler for the `tempvc-cleanup` scheduled task.

import { container } from "@sapphire/framework";
import type TempVcService from "../services/TempVcService.js";
import type { TempVcCleanupPayload } from "../scheduled-tasks/CleanupTask.js";

export async function handleTempVcCleanupFire(
  payload: TempVcCleanupPayload,
): Promise<void> {
  const service = container.stores.get("services").get("tempvc") as
    | TempVcService
    | undefined;
  if (!service) return;
  await service.runCleanup(payload);
}
