import { container } from "#src/lib/Services.js";
import type { ModerationCase } from "@prisma/client";
import { BanAction } from "#src/modules/mod/services/actions/BanAction.js";
import { MuteAction } from "#src/modules/mod/services/actions/MuteAction.js";
import { VoiceMuteAction } from "#src/modules/mod/services/actions/VoiceMuteAction.js";

export async function liftModerationCaseWithUndo(
  moderationCase: ModerationCase,
  reason: string,
): Promise<void> {
  switch (moderationCase.action) {
    case "mute":
      await MuteAction.undoRaw(moderationCase.guildId, moderationCase.userId, reason);
      break;
    case "ban":
      await BanAction.undoRaw(moderationCase.guildId, moderationCase.userId, reason);
      break;
    case "voice_mute":
      await VoiceMuteAction.undoRaw(moderationCase.guildId, moderationCase.userId, reason);
      break;
    default:
      break;
  }

  await container.db.moderation.liftModerationCase(moderationCase.id);
}
