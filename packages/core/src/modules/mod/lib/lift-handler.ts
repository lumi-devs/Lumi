// Worker-side fire handler for the `mod-lift` scheduled task. Registered by
// ModModule.onLoad() via `registerTaskFireHandler`.
//
// Reaches Discord via REST (through nirn-proxy when DISCORD_PROXY_URL is set),
// not via `client.guilds.cache`. In the worker role any given guild may not be
// in this process's local cache — a shared `lumi-workers` consumer group
// round-robins raw gateway events, so cache locality is not guaranteed for the
// target guild. The REST path is correct under every topology.

import { container } from "@sapphire/framework";
import { Routes } from "discord-api-types/v10";
import { errorCode } from "#utilities/errors.js";
import type { ModLiftPayload } from "../scheduled-tasks/ModLiftTask.js";

export async function handleModLiftFire(
  payload: ModLiftPayload,
): Promise<void> {
  const c = await container.db.moderation.getModerationCaseById(payload.caseId);
  // Already lifted (e.g. manual unmute/unban) or deleted — nothing to do.
  if (!c?.active) return;

  const { rest } = container.client;
  const reason = `[AutoLift] ${c.action === "mute" ? "Mute" : "Ban"} case #${c.caseNumber} expired`;

  try {
    if (c.action === "mute") {
      // Clear communication_disabled_until. 10007 = Unknown Member (left guild)
      // and 50013 = Missing Permissions are both acceptable terminal states.
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
      // 10026 = Unknown Ban (already unbanned manually).
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
