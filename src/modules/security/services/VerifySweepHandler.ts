import { type Container } from "#src/lib/Services.js";
import { mapWithConcurrency } from "#src/lib/utilities/Concurrency.js";
import { sweepExpiredPending } from "#src/modules/security/services/Verification.js";

const SweepConcurrency = 10;

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
