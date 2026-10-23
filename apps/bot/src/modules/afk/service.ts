import type { AfkEntry } from "@lumi/db";
import type { LumiServices } from "@lumi/bot-kit";
import { since } from "@lumi/foundation";

export const NickPrefix = "[AFK] ";
export const MaxReasonLength = 100;

export interface AfkMentionRecord {
  authorId: string;
  channelId: string;
  messageId: string;
  ts: number;
}

export function sanitizeReason(reason: string): string {
  return reason.replace(/\s+/g, " ").trim().slice(0, MaxReasonLength) || "AFK";
}

export function afkSince(entry: AfkEntry): string {
  return since(entry.since);
}

export function stripNickPrefix(displayName: string): string | null {
  if (!displayName.startsWith(NickPrefix)) return null;
  return displayName.slice(NickPrefix.length).trim() || null;
}

export async function recordAfkMention(
  services: LumiServices,
  guildId: string,
  targetUserId: string,
  record: AfkMentionRecord,
): Promise<void> {
  const key = services.keys.afkMentions(guildId, targetUserId);
  const raw = await services.redis.get(key).catch(() => null);
  const list: AfkMentionRecord[] = raw ? JSON.parse(raw) : [];
  list.unshift(record);
  if (list.length > 50) list.length = 50;
  await services.redis.set(key, JSON.stringify(list), "EX", 7 * 86_400).catch(() => undefined);
}

export async function getAfkMentions(
  services: LumiServices,
  guildId: string,
  targetUserId: string,
): Promise<AfkMentionRecord[]> {
  const key = services.keys.afkMentions(guildId, targetUserId);
  const raw = await services.redis.get(key).catch(() => null);
  return raw ? JSON.parse(raw) : [];
}

export async function clearAfkMentions(
  services: LumiServices,
  guildId: string,
  targetUserId: string,
): Promise<void> {
  const key = services.keys.afkMentions(guildId, targetUserId);
  await services.redis.del(key).catch(() => undefined);
}
