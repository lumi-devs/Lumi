// Worker-side fire handler for the `mod-lift` scheduled task. Registered by
// ModModule.onLoad() via `registerTaskFireHandler`.

import { container } from "@sapphire/framework";
import type { ModLiftPayload } from "../scheduled-tasks/ModLiftTask.js";

export async function handleModLiftFire(
  payload: ModLiftPayload,
): Promise<void> {
  const c = await container.db.moderation.getModerationCaseById(payload.caseId);
  // Already lifted (e.g. manual unmute/unban) or deleted — nothing to do.
  if (!c?.active) return;

  try {
    if (c.action === "mute") {
      const guild = container.client.guilds.cache.get(c.guildId);
      const member = await guild?.members.fetch(c.userId).catch(() => null);
      if (member?.isCommunicationDisabled()) {
        await member.timeout(
          null,
          `[AutoLift] Mute case #${c.caseNumber} expired`,
        );
      }
    } else if (c.action === "ban") {
      const guild = container.client.guilds.cache.get(c.guildId);
      await guild?.bans
        .remove(c.userId, `[AutoLift] Ban case #${c.caseNumber} expired`)
        .catch(() => null);
    }

    await container.db.moderation.liftModerationCase(c.id);
    container.logger.debug(
      `[ModLiftTask] Lifted case #${c.caseNumber} (${c.guildId}/${c.userId}).`,
    );
  } catch (err: unknown) {
    container.logger.error(
      `[ModLiftTask] Failed to lift case #${c.caseNumber} (${c.guildId}/${c.userId}):`,
      err,
    );
    throw err;
  }
}
