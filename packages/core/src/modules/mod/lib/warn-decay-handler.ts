import { container } from "@sapphire/framework";
import type { WarnDecayPayload } from "../scheduled-tasks/warnDecay.js";
import { decrementWarnCount } from "./thresholds.js";

export async function handleWarnDecayFire(
  _payload: WarnDecayPayload,
): Promise<void> {
  const cases = await container.db.moderation.getActiveWarnCases();
  const now = new Date();

  const guildConfigs = new Map<string, number>();

  for (const c of cases) {
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

    if (diffDays > decayDays) {
      await container.db.moderation.liftModerationCase(c.id);
      await decrementWarnCount(container, c.guildId, c.userId);
      container.logger.debug(
        `[WarnDecay] Decayed warn case #${c.caseNumber} for user ${c.userId} in guild ${c.guildId}`,
      );
    }
  }
}
