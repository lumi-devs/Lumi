import { container } from "@sapphire/framework";

export enum RequesterType {
  DISCORD_DELETED_USER = "DISCORD_DELETED_USER",
  OWNER = "OWNER",
  USER = "USER",
  USER_STRICT = "USER_STRICT",
}

export async function executeGdprDeletion(
  userId: string,
  requester: RequesterType,
): Promise<void> {
  container.logger.info(
    `[GDPR] Starting global data deletion for user: ${userId} (Requester: ${requester})`,
  );

  // 1. Module-level deletions
  const moduleStore = container.stores.get("modules");
  if (moduleStore) {
    for (const module of moduleStore.values()) {
      try {
        if (typeof module.deleteUserData === "function") {
          await module.deleteUserData(userId, requester);
          container.logger.debug(
            `[GDPR] Module '${module.name}' processed deletion for ${userId}`,
          );
        }
      } catch (err: unknown) {
        container.logger.error(
          `[GDPR] Module '${module.name}' failed to process deletion for ${userId}:`,
          err,
        );
      }
    }
  }

  // 2. Core database & cache deletions (routed through Repository layer)
  try {
    await container.db.deleteUserData(userId);
  } catch (err: unknown) {
    container.logger.error(
      `[GDPR] Core database/cache deletion failed for ${userId}:`,
      err,
    );
  }

  container.logger.info(
    `[GDPR] Completed global data deletion for user: ${userId}`,
  );
}
