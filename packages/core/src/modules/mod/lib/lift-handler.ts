import { container } from "@sapphire/framework";
import { acquireRedisLock } from "#lib/redis-lock.js";
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
  // The fire stream is at-least-once (XAUTOCLAIM can redeliver a fire that is
  // still running elsewhere), so the active-check and the lift have to be
  // mutually exclusive across processes - otherwise the same case unbans twice.
  const release = await acquireRedisLock(
    container.redis,
    `lumi:lock:mod-lift:${payload.caseId}`,
    { ttlMs: 30_000, acquireTimeoutMs: 60_000 },
  );
  try {
    await liftCase(payload);
  } finally {
    await release();
  }
}

async function liftCase(payload: ModLiftPayload): Promise<void> {
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
