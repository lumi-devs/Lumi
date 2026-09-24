import { cutText } from "@sapphire/utilities";
import { formatDuration } from "#lib/utilities/time.js";
import { AfkMaxReasonLength } from "../constants.js";

export function sanitizeReason(reason: string): string {
  const f =
    reason
      ?.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join(" ")
      .replace(/\s+/g, " ") || "AFK";
  return cutText(f, AfkMaxReasonLength);
}

export function afkDurationSince(since: Date): string {
  return formatDuration(Date.now() - since.getTime());
}
