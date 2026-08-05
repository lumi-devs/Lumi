import { container } from "@sapphire/framework";

/** Module hooks run before the core deletion so they can still resolve rows the core delete is about to remove. */
export async function executeGdprDeletion(
  userId: string,
  requester?: string,
): Promise<void> {
  for (const module of container.moduleStore.values()) {
    await module.deleteUserData(userId, requester);
  }
  await container.db.deleteUserData(userId);
}

/** Keyed by module name (core data under `"core"`); modules returning `null` are omitted. */
export async function executeGdprExport(
  userId: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  const core = await container.db.exportUserData(userId);
  if (core) result["core"] = core;

  for (const module of container.moduleStore.values()) {
    const data = await module.exportUserData(userId);
    if (data) result[module.name] = data;
  }

  return result;
}
