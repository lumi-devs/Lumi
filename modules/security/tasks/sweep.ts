import type { LumiServices } from "@lumi/module-kit";
import { getSecurityConfig } from "../services/config.ts";
import { sweepExpiredPending } from "../services/verification.ts";

const SweepIntervalMs = 60_000;

export function startVerificationSweep(services: LumiServices): () => void {
  let running = false;

  const sweep = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const guilds = services.client?.guilds?.cache?.values?.() ?? [];
      for (const guild of guilds) {
        if (!(await services.modules.isEnabled(guild.id, "security"))) continue;
        const config = await getSecurityConfig(services, guild.id).catch(() => null);
        if (!config?.verification_enabled) continue;
        await sweepExpiredPending(services, guild, config).catch((error: unknown) => {
          services.logger.warn(
            { error, guildId: guild.id },
            "verification expiry sweep failed",
          );
        });
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void sweep(), SweepIntervalMs);
  timer.unref();
  void sweep();

  return () => clearInterval(timer);
}
