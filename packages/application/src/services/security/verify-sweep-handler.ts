import { container } from "@sapphire/framework";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";
import { sweepExpiredPending } from "./verification.js";

/** Sweeps touch the Discord API per guild, so the fan-out stays capped. */
const SweepConcurrency = 10;

/** Each worker iterates its own `guilds.cache` (shard affinity preserved). */
export async function handleVerifySweepFire(): Promise<void> {
  const guilds = [...container.client.guilds.cache.values()];
  await mapWithConcurrency(guilds, SweepConcurrency, async (guild) => {
    const enabled = await container.db.modules
      .isModuleEnabled(guild.id, "security")
      .catch(() => false);
    if (!enabled) return;
    await sweepExpiredPending(guild).catch((err: unknown) => {
      container.logger.error(
        `[security] Verify sweep failed for ${guild.id}:`,
        err,
      );
    });
  });
}
