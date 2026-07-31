import { container } from "@sapphire/framework";
import { tryGetService } from "#lib/module-system/Service.js";

/**
 * Broadcast fire handler for the periodic verification sweep. Each worker
 * iterates its own `guilds.cache` (shard affinity preserved) and evicts members
 * whose verification window elapsed.
 */
export async function handleVerifySweepFire(): Promise<void> {
  const security = tryGetService("security");
  if (!security) return;
  for (const guild of container.client.guilds.cache.values()) {
    const enabled = await container.db.modules
      .isModuleEnabled(guild.id, "security")
      .catch(() => false);
    if (!enabled) continue;
    await security.sweepExpiredPending(guild).catch((err: unknown) => {
      container.logger.error(
        `[security] Verify sweep failed for ${guild.id}:`,
        err,
      );
    });
  }
}
