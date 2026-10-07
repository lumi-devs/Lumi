import { type Container } from "#lib/services.js";
import type { ModerationCase } from "@prisma/client";
import type { WarnDecayPayload } from "#modules/mod/scheduled-tasks/warnDecay.js";
import { decrementWarnCounts } from "./thresholds.js";

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

    // Each page is lifted independently so one failing batch cannot discard the
    // decay work already done for earlier pages.
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
