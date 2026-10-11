import { type Container } from "#src/lib/Services.js";
import { Time } from "#src/shared/Index.ts";
import {acquireValkeyLock} from "#src/lib/valkey/Lock.js";
import type { ModLiftPayload } from "#src/modules/mod/tasks/ModLift.js";
import { liftModerationCaseWithUndo } from "#src/modules/mod/services/CaseLift.js";
import { errorCode } from "#src/lib/utilities/Errors.js";

const ActionLabels: Record<string, string> = {
  mute: "Mute",
  ban: "Ban",
  voice_mute: "Voice Mute",
};

export async function handleModLiftFire(
  services: Container,
  payload: ModLiftPayload,
): Promise<void> {
  const { release } = await acquireValkeyLock(
    services.valkey,
    `lumi:lock:mod-lift:${payload.caseId}`,
    { ttlMs: Time.Second * 30, acquireTimeoutMs: Time.Minute },
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
