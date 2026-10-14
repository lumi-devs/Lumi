import type { Container } from "#src/lib/Services.js";

export async function sweepDataRetention(
  _services: Container,
): Promise<{ deletedModuleData: number }> {
  return { deletedModuleData: 0 };
}

export async function handleDataRetentionFire(
  _services: Container,
): Promise<void> {}
