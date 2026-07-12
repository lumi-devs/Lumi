import { container } from "@sapphire/framework";
import { Routes } from "discord-api-types/v10";
import { errorCode } from "#lib/utilities/errors.js";
import type { ModLiftPayload } from "../scheduled-tasks/modLift.js";

export async function handleModLiftFire(
  payload: ModLiftPayload,
): Promise<void> {
  const c = await container.db.moderation.getModerationCaseById(payload.caseId);
  if (!c?.active) return;

  const { rest } = container.client;
  const reason = `[AutoLift] ${c.action === "mute" ? "Mute" : "Ban"} case #${c.caseNumber} expired`;

  try {
    if (c.action === "mute") {
      await rest
        .patch(Routes.guildMember(c.guildId, c.userId), {
          body: { communication_disabled_until: null },
          reason,
        })
        .catch((err: unknown) => {
          const code = errorCode(err);
          if (code === 10007 || code === 50013) return;
          throw err;
        });
    } else if (c.action === "ban") {
      await rest
        .delete(Routes.guildBan(c.guildId, c.userId), { reason })
        .catch((err: unknown) => {
          const code = errorCode(err);
          if (code === 10026 || code === 50013) return;
          throw err;
        });
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
