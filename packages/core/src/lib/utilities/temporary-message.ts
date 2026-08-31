import type { Message, RepliableInteraction } from "discord.js";
import { swallow } from "#lib/utilities/errors.js";

export const TransientReplyTtl = 5_000;

export function deleteMessageLater(
  message: Message,
  delayMs = TransientReplyTtl,
  reason = "deleteMessageLater",
): void {
  const timer = setTimeout(
    () => void message.delete().catch(swallow(reason)),
    delayMs,
  );
  timer.unref?.();
}

/** {@link deleteMessageLater} for an interaction's own reply. */
export function deleteReplyLater(
  interaction: RepliableInteraction,
  delayMs = TransientReplyTtl,
  reason = "deleteReplyLater",
): void {
  const timer = setTimeout(
    () => void interaction.deleteReply().catch(swallow(reason)),
    delayMs,
  );
  timer.unref?.();
}
