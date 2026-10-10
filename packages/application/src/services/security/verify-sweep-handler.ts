import { type Container } from "@lumi/lib/services.js";
import { mapWithConcurrency } from "@lumi/lib/utilities/concurrency.js";
import { sweepExpiredPending } from "./verification.js";

/** Sweeps touch the Discord API per guild, so the fan-out stays capped. */
const SweepConcurrency = 10;

/** Each worker iterates its own `guilds.cache` (shard affinity preserved). */
export async function handleVerifySweepFire(services: Container): Promise<void> {
  const guilds = [...services.client.guilds.cache.values()];
  await mapWithConcurrency(guilds, SweepConcurrency, async (guild) => {
    const enabled = await services.db.modules
      .isModuleEnabled(guild.id, "security")
      .catch(() => false);
    if (!enabled) return;
    await sweepExpiredPending(services, guild).catch((err: unknown) => {
      services.logger.error(
        `[security] Verify sweep failed for ${guild.id}:`,
        err,
      );
    });
  });
}
