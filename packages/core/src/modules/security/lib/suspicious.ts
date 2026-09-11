import type { User } from "discord.js";
import { Time } from "@sapphire/time-utilities";

const SuspiciousAccountAgeMs = 7 * Time.Day;

/**
 * Coarse "throwaway account" heuristic shared by verification targeting and
 * (later) join-raid flagging: an account younger than a week, or one that
 * never set a custom avatar. Either signal alone is common for genuine new
 * users too, so callers should use this to narrow *scrutiny*, not as grounds
 * for an outright block on its own.
 */
export function isSuspiciousAccount(user: User): boolean {
  const ageMs = Date.now() - user.createdTimestamp;
  return ageMs < SuspiciousAccountAgeMs || user.avatar === null;
}
