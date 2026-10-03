import { container } from "@sapphire/framework";
import type { ModerationCase } from "@prisma/client";
import { BanAction } from "./actions/BanAction.js";
import { MuteAction } from "./actions/MuteAction.js";
import { VoiceMuteAction } from "./actions/VoiceMuteAction.js";

/**
 * Undoes the Discord-side effect of a case's action (if it has one) and marks
 * the case lifted in the database. Gateway-free: every undo goes over REST
 * (`*Action.undoRaw`), so this runs the same in `apps/api` and
 * `apps/scheduler`, neither of which has a Discord gateway connection.
 *
 * Callers that can race the same case (the scheduled auto-lift fire, which is
 * at-least-once delivery) must hold their own lock around this - it has none.
 */
export async function liftModerationCaseWithUndo(
  moderationCase: ModerationCase,
  reason: string,
): Promise<void> {
  if (moderationCase.action === "mute") {
    await MuteAction.undoRaw(moderationCase.guildId, moderationCase.userId, reason);
  } else if (moderationCase.action === "ban") {
    await BanAction.undoRaw(moderationCase.guildId, moderationCase.userId, reason);
  } else if (moderationCase.action === "voice_mute") {
    await VoiceMuteAction.undoRaw(moderationCase.guildId, moderationCase.userId, reason);
  }

  await container.db.moderation.liftModerationCase(moderationCase.id);
}
