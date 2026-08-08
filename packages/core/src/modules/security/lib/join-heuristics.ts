import type { User } from "discord.js";

/** Wick-style raid indicator: no custom avatar. Cheap, no API calls. */
export function hasNoAvatar(user: User): boolean {
  return user.avatar === null;
}

/** `member.user.bot && !VerifiedBot` - real bot verification requires Discord's own review. */
export function isUnverifiedBot(user: User): boolean {
  return user.bot && !(user.flags?.has("VerifiedBot") ?? false);
}

/** Simple substring match against comma-configured patterns - regex would need a safety review. */
export function matchesUsernamePattern(username: string, patterns: string[]): boolean {
  const lower = username.toLowerCase();
  return patterns.some((p) => p.trim().length > 0 && lower.includes(p.trim().toLowerCase()));
}

/**
 * Not implemented here yet - Phase 4's verification work may land a shared
 * `isSuspiciousAccount(user)` in `./suspicious.ts`; this file's join-gate
 * heuristics (no-avatar, min-age, username-similarity, creation clustering)
 * overlap with it and could be merged into one shared helper later.
 */

const LEVENSHTEIN_MAX_LEN = 32;

/** Bounded edit distance; recent-joiner usernames are short so this stays cheap. */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.slice(0, LEVENSHTEIN_MAX_LEN);
  const s2 = b.slice(0, LEVENSHTEIN_MAX_LEN);
  const rows = s1.length + 1;
  const cols = s2.length + 1;
  const dp: number[] = new Array(rows * cols).fill(0);
  for (let i = 0; i < rows; i++) dp[i * cols] = i;
  for (let j = 0; j < cols; j++) dp[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      const del = (dp[(i - 1) * cols + j] ?? 0) + 1;
      const ins = (dp[i * cols + j - 1] ?? 0) + 1;
      const sub = (dp[(i - 1) * cols + j - 1] ?? 0) + cost;
      dp[i * cols + j] = Math.min(del, ins, sub);
    }
  }
  return dp[rows * cols - 1] ?? 0;
}

const SIMILARITY_DISTANCE_THRESHOLD = 2;

/** Same-prefix or near-identical usernames within a short window smell like a bot batch. */
export function isUsernameSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const shortestPrefix = Math.min(a.length, b.length, 5);
  if (shortestPrefix >= 4 && a.slice(0, shortestPrefix) === b.slice(0, shortestPrefix)) {
    return true;
  }
  return levenshteinDistance(a, b) <= SIMILARITY_DISTANCE_THRESHOLD;
}

export interface RecentJoiner {
  username: string;
  createdTimestamp: number;
}

/** Bucket by creation day - accounts minted in bulk for a raid share a creation date. */
export function creationDayBucket(createdTimestamp: number): number {
  return Math.floor(createdTimestamp / 86_400_000);
}

const CLUSTER_SHARE_THRESHOLD = 0.5;
const CLUSTER_MIN_SAMPLE = 3;

/**
 * True when an unusual share of recent joiners were created on the same day
 * as `member`, suggesting an accounts-farmed-in-bulk raid rather than
 * organic growth.
 */
export function isCreationClustered(
  createdTimestamp: number,
  recentJoiners: RecentJoiner[],
): boolean {
  if (recentJoiners.length < CLUSTER_MIN_SAMPLE) return false;
  const bucket = creationDayBucket(createdTimestamp);
  const sameDay = recentJoiners.filter(
    (j) => creationDayBucket(j.createdTimestamp) === bucket,
  ).length;
  return sameDay / recentJoiners.length >= CLUSTER_SHARE_THRESHOLD;
}

/** Any recent joiner whose username is similar to `username`. */
export function hasSimilarRecentJoiner(username: string, recentJoiners: RecentJoiner[]): boolean {
  return recentJoiners.some((j) => isUsernameSimilar(username, j.username));
}
