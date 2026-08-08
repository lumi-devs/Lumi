import type { User } from "discord.js";

const SUSPICIOUS_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Coarse "throwaway account" heuristic shared by verification targeting and
 * (later) join-raid flagging: an account younger than a week, or one that
 * never set a custom avatar. Either signal alone is common for genuine new
 * users too, so callers should use this to narrow *scrutiny*, not as grounds
 * for an outright block on its own.
 */
export function isSuspiciousAccount(user: User): boolean {
  const ageMs = Date.now() - user.createdTimestamp;
  return ageMs < SUSPICIOUS_ACCOUNT_AGE_MS || user.avatar === null;
}
