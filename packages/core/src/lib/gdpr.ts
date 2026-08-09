import { container } from "@sapphire/framework";

/** Module hooks run before the core deletion so they can still resolve rows the core delete is about to remove. */
export async function executeGdprDeletion(
  userId: string,
  requester?: string,
): Promise<void> {
  const modules = Array.from(container.moduleStore.values());
  const results = await Promise.allSettled(
    modules.map((m) => m.deleteUserData(userId, requester)),
  );

  for (let i = 0; i < results.length; i++) {
    const res = results[i]!;
    if (res.status === "rejected") {
      container.logger.error(
        `[GDPR] Module '${modules[i]!.name}' failed deleteUserData for ${userId}:`,
        res.reason,
      );
    }
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

  const modules = Array.from(container.moduleStore.values());
  const exports = await Promise.allSettled(
    modules.map((m) => m.exportUserData(userId)),
  );

  for (let i = 0; i < exports.length; i++) {
    const res = exports[i]!;
    if (res.status === "fulfilled" && res.value != null) {
      result[modules[i]!.name] = res.value;
    } else if (res.status === "rejected") {
      container.logger.warn(
        `[GDPR] Module '${modules[i]!.name}' failed exportUserData for ${userId}:`,
        res.reason,
      );
    }
  }

  return result;
}
