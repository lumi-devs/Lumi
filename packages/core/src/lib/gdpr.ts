import { container } from "@sapphire/framework";
import { errorFrom } from "#lib/utilities/errors.js";

export enum RequesterType {
  DISCORD_DELETED_USER = "DISCORD_DELETED_USER",
  OWNER = "OWNER",
  USER = "USER",
  USER_STRICT = "USER_STRICT",
}

export class GdprDeletionError extends Error {
  public readonly failures: { source: string; message: string }[];

  public constructor(failures: { source: string; message: string }[]) {
    const lines = failures
      .map((f) => `  - ${f.source}: ${f.message}`)
      .join("\n");
    super(
      `GDPR deletion completed with ${failures.length} failure(s):\n${lines}`,
    );
    this.name = "GdprDeletionError";
    this.failures = failures;
  }
}

export async function executeGdprDeletion(
  userId: string,
  requester: RequesterType,
): Promise<void> {
  container.logger.info(
    `[GDPR] Starting global data deletion for user: ${userId} (Requester: ${requester})`,
  );

  const failures: { source: string; message: string }[] = [];

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
        const { message } = errorFrom(err);
        container.logger.error(
          `[GDPR] Module '${module.name}' failed to process deletion for ${userId}:`,
          err,
        );
        failures.push({ source: `module:${module.name}`, message });
      }
    }
  }

  try {
    await container.db.deleteUserData(userId);
  } catch (err: unknown) {
    const { message } = errorFrom(err);
    container.logger.error(
      `[GDPR] Core database/cache deletion failed for ${userId}:`,
      err,
    );
    failures.push({ source: "core:database", message });
  }

  if (failures.length > 0) {
    throw new GdprDeletionError(failures);
  }

  container.logger.info(
    `[GDPR] Completed global data deletion for user: ${userId}`,
  );
}
