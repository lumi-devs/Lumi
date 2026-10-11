import type { User } from "discord.js";

export function hasNoAvatar(user: User): boolean {
  return user.avatar === null;
}

export function isUnverifiedBot(user: User): boolean {
  return user.bot && !(user.flags?.has("VerifiedBot") ?? false);
}

export function matchesUsernamePattern(username: string, patterns: string[]): boolean {
  const lower = username.toLowerCase();
  return patterns.some((p) => p.trim().length > 0 && lower.includes(p.trim().toLowerCase()));
}

const AdvertisingPattern =
  /(discord\.gg\/|discordapp\.com\/invite\/|t\.me\/|https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,})/i;

export function hasAdvertisingIndicators(user: User): boolean {
  const displayName = user.globalName ?? user.username;
  return AdvertisingPattern.test(displayName);
}

const LevenshteinMaxLen = 32;

function levenshteinDistance(a: string, b: string): number {
  const s1 = a.slice(0, LevenshteinMaxLen);
  const s2 = b.slice(0, LevenshteinMaxLen);
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

const SimilarityDistanceThreshold = 2;

function isUsernameSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const shortestPrefix = Math.min(a.length, b.length, 5);
  if (shortestPrefix >= 4 && a.slice(0, shortestPrefix) === b.slice(0, shortestPrefix)) {
    return true;
  }
  return levenshteinDistance(a, b) <= SimilarityDistanceThreshold;
}

export interface RecentJoiner {
  username: string;
  createdTimestamp: number;
}

function creationDayBucket(createdTimestamp: number): number {
  return Math.floor(createdTimestamp / 86_400_000);
}

const ClusterShareThreshold = 0.5;
const ClusterMinSample = 3;

export function isCreationClustered(
  createdTimestamp: number,
  recentJoiners: RecentJoiner[],
): boolean {
  if (recentJoiners.length < ClusterMinSample) return false;
  const bucket = creationDayBucket(createdTimestamp);
  const sameDay = recentJoiners.filter(
    (j) => creationDayBucket(j.createdTimestamp) === bucket,
  ).length;
  return sameDay / recentJoiners.length >= ClusterShareThreshold;
}

export function hasSimilarRecentJoiner(username: string, recentJoiners: RecentJoiner[]): boolean {
  return recentJoiners.some((j) => isUsernameSimilar(username, j.username));
}
