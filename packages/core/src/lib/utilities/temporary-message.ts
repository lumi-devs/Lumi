import type { Message, RepliableInteraction } from "discord.js";
import { sleep } from "@sapphire/utilities";
import { swallow } from "@lumi/lib/utilities/errors.js";

export const TransientReplyTtl = 5_000;

export function deleteMessageLater(
  message: Message,
  delayMs = TransientReplyTtl,
  reason = "deleteMessageLater",
): void {
  void sleep(delayMs, undefined, { ref: false }).then(() =>
    message.delete().catch(swallow(reason)),
  );
}

/** {@link deleteMessageLater} for an interaction's own reply. */
export function deleteReplyLater(
  interaction: RepliableInteraction,
  delayMs = TransientReplyTtl,
  reason = "deleteReplyLater",
): void {
  void sleep(delayMs, undefined, { ref: false }).then(() =>
    interaction.deleteReply().catch(swallow(reason)),
  );
}
