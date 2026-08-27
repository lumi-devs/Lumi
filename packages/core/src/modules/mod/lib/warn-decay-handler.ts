import { container } from "@sapphire/framework";
import type { ModerationCase } from "@prisma/client";
import type { WarnDecayPayload } from "../scheduled-tasks/warnDecay.js";
import { decrementWarnCounts } from "./thresholds.js";

export async function handleWarnDecayFire(
  _payload: WarnDecayPayload,
): Promise<void> {
  const now = new Date();
  const guildConfigs = new Map<string, number>();

  for await (const page of container.db.moderation.iterateActiveWarnCases()) {
    const decaying: ModerationCase[] = [];

    for (const c of page) {
      if (!guildConfigs.has(c.guildId)) {
        const config = await container.db.config.getModuleConfig(
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
      await container.db.moderation.liftModerationCases(
        decaying.map((c) => c.id),
      );
      await decrementWarnCounts(
        container,
        decaying.map((c) => ({ guildId: c.guildId, userId: c.userId })),
      );
      container.logger.debug(
        `[WarnDecay] Decayed ${decaying.length} warn case(s): ${decaying
          .map((c) => `#${c.caseNumber}`)
          .join(", ")}`,
      );
    } catch (err) {
      container.logger.warn(
        `[WarnDecay] Failed to decay ${decaying.length} warn case(s):`,
        err,
      );
    }
  }
}
