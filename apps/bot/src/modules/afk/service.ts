import type { AfkEntry } from "@lumi/db";
import { since } from "@lumi/foundation";

export const NickPrefix = "[AFK] ";
export const MaxReasonLength = 100;

export function sanitizeReason(reason: string): string {
  return reason.replace(/[\r\n\t]+/g, " ").trim().slice(0, MaxReasonLength) || "AFK";
}

export function afkSince(entry: AfkEntry): string {
  return since(entry.since);
}

export function stripNickPrefix(displayName: string): string | null {
  if (!displayName.startsWith(NickPrefix)) return null;
  return displayName.slice(NickPrefix.length).trim() || null;
}
