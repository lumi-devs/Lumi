import { container } from "@sapphire/framework";
import { tryGetService } from "#lib/module-system/Service.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

/** Sweeps touch the Discord API per guild, so the fan-out stays capped. */
const SWEEP_CONCURRENCY = 10;

/**
 * Broadcast fire handler for the periodic verification sweep. Each worker
 * iterates its own `guilds.cache` (shard affinity preserved) and evicts members
 * whose verification window elapsed.
 */
export async function handleVerifySweepFire(): Promise<void> {
  const security = tryGetService("security");
  if (!security) return;
  const guilds = [...container.client.guilds.cache.values()];
  await mapWithConcurrency(guilds, SWEEP_CONCURRENCY, async (guild) => {
    const enabled = await container.db.modules
      .isModuleEnabled(guild.id, "security")
      .catch(() => false);
    if (!enabled) return;
    await security.sweepExpiredPending(guild).catch((err: unknown) => {
      container.logger.error(
        `[security] Verify sweep failed for ${guild.id}:`,
        err,
      );
    });
  });
}
