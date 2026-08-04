import { container } from "@sapphire/framework";
import type { ModLiftPayload } from "../scheduled-tasks/modLift.js";
import { MuteAction, BanAction, VoiceMuteAction } from "../actions/index.js";

const ACTION_LABELS: Record<string, string> = {
  mute: "Mute",
  ban: "Ban",
  voice_mute: "Voice Mute",
};

export async function handleModLiftFire(
  payload: ModLiftPayload,
): Promise<void> {
  const c = await container.db.moderation.getModerationCaseById(payload.caseId);
  if (!c?.active) return;

  const reason = `[AutoLift] ${ACTION_LABELS[c.action] ?? c.action} case #${c.caseNumber} expired`;

  try {
    if (c.action === "mute") {
      await MuteAction.undoRaw(c.guildId, c.userId, reason);
    } else if (c.action === "ban") {
      await BanAction.undoRaw(c.guildId, c.userId, reason);
    } else if (c.action === "voice_mute") {
      await VoiceMuteAction.undoRaw(c.guildId, c.userId, reason);
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
