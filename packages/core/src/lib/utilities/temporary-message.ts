import type { Message, RepliableInteraction } from "discord.js";
import { swallow } from "#lib/utilities/errors.js";

/**
 * Default lifetime for transient/auto-deleting replies (error cards, filter
 * warnings, etc.) before they are floated away. Skyra uses one minute for
 * command output; Lumi's transient error/warning cards are shorter-lived.
 */
export const TRANSIENT_REPLY_TTL = 5_000;

/**
 * Float a delayed deletion of a sent message. The timer is `unref`'d so it
 * never keeps the process alive during shutdown, and failures are swallowed at
 * debug level (the message may already be gone).
 *
 * Mirrors Skyra's `deleteMessage` / `sendTemporaryMessage` pattern — one place
 * owns the "reply now, clean up later" behavior instead of scattered
 * `setTimeout(() => x.delete(), …)` calls.
 */
export function deleteMessageLater(
  message: Message,
  delayMs = TRANSIENT_REPLY_TTL,
  reason = "deleteMessageLater",
): void {
  setTimeout(
    () => void message.delete().catch(swallow(reason)),
    delayMs,
  ).unref();
}

/** {@link deleteMessageLater} for an interaction's own reply. */
export function deleteReplyLater(
  interaction: RepliableInteraction,
  delayMs = TRANSIENT_REPLY_TTL,
  reason = "deleteReplyLater",
): void {
  setTimeout(
    () => void interaction.deleteReply().catch(swallow(reason)),
    delayMs,
  ).unref();
}
