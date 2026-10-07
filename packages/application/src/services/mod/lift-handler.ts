import { type Container } from "#lib/services.js";
import { Ms } from "@lumi/shared";
import { acquireValkeyLock } from "#lib/lock.js";
import type { ModLiftPayload } from "#modules/mod/scheduled-tasks/modLift.js";
import { liftModerationCaseWithUndo } from "./case-lift.js";
import { errorCode } from "#lib/utilities/errors.js";

const ActionLabels: Record<string, string> = {
  mute: "Mute",
  ban: "Ban",
  voice_mute: "Voice Mute",
};

export async function handleModLiftFire(
  services: Container,
  payload: ModLiftPayload,
): Promise<void> {
  // The fire stream is at-least-once (XAUTOCLAIM can redeliver a fire that is
  // still running elsewhere), so the active-check and the lift have to be
  // mutually exclusive across processes - otherwise the same case unbans twice.
  const { release } = await acquireValkeyLock(
    services.valkey,
    `lumi:lock:mod-lift:${payload.caseId}`,
    { ttlMs: Ms.Second * 30, acquireTimeoutMs: Ms.Minute },
  );
  try {
    await liftCase(services, payload);
  } finally {
    await release();
  }
}

async function liftCase(services: Container, payload: ModLiftPayload): Promise<void> {
  const c = await services.db.moderation.getModerationCaseById(payload.caseId);
  if (!c?.active) return;

  const reason = `[AutoLift] ${ActionLabels[c.action] ?? c.action} case #${c.caseNumber} expired`;

  try {
    await liftModerationCaseWithUndo(c, reason);
    services.logger.debug(
      `[ModLiftTask] Lifted case #${c.caseNumber} (${c.guildId}/${c.userId}).`,
    );
  } catch (err: unknown) {
    const missingPermission = errorCode(err) === 50013;
    services.logger.error(
      missingPermission
        ? `[ModLiftTask] Lumi lacks Discord permission to auto-lift case #${c.caseNumber} (${c.guildId}/${c.userId}). The case stays active; grant the bot the permission and retry from the dashboard.`
        : `[ModLiftTask] Failed to lift case #${c.caseNumber} (${c.guildId}/${c.userId}):`,
      err,
    );
    throw err;
  }
}
