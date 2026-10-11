import { type Container } from "#src/lib/Services.js";
import type { ModerationCase } from "@prisma/client";
import type { WarnDecayPayload } from "#src/modules/mod/tasks/WarnDecay.js";
import { decrementWarnCounts } from "#src/modules/mod/services/Thresholds.js";

export async function handleWarnDecayFire(
  services: Container,
  _payload: WarnDecayPayload,
): Promise<void> {
  const now = new Date();
  const guildConfigs = new Map<string, number>();

  for await (const page of services.db.moderation.iterateActiveWarnCases()) {
    const decaying: ModerationCase[] = [];

    for (const c of page) {
      if (!guildConfigs.has(c.guildId)) {
        const config = await services.db.config.getModuleConfig(
          c.guildId,
          "mod",
          "warn_decay_days",
        );
        guildConfigs.set(c.guildId, typeof config === "number" ? config : 30);
      }
      const decayDays = guildConfigs.get(c.guildId)!;

      const diffMs = now.getTime() - c.createdAt.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays >= decayDays) decaying.push(c);
    }

    if (decaying.length === 0) continue;

    try {
      await services.db.moderation.liftModerationCases(
        decaying.map((c) => c.id),
      );
      await decrementWarnCounts(
        services,
        decaying.map((c) => ({ guildId: c.guildId, userId: c.userId })),
      );
      services.logger.debug(
        `[WarnDecay] Decayed ${decaying.length} warn case(s): ${decaying
          .map((c) => `#${c.caseNumber}`)
          .join(", ")}`,
      );
    } catch (err) {
      services.logger.warn(
        `[WarnDecay] Failed to decay ${decaying.length} warn case(s):`,
        err,
      );
    }
  }
}
