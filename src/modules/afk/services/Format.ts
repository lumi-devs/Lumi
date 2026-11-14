import { cutText } from "@shared/Index.ts";
import { formatDuration } from "@utilities/Time.js";
import { AfkMaxReasonLength } from "@modules/afk/Constants.js";

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
