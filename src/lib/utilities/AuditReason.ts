import type { User } from "discord.js";

export function formatAuditReason(
  actor: User,
  reason: string | null,
  maxLen = 512,
): string {
  const prefix = `[${actor.tag} | ${actor.id}] `;
  const full = prefix + (reason ?? "No reason provided.");
  if (full.length <= maxLen) return full;

  const cut = full.charCodeAt(maxLen - 1) >= 0xd800 &&
    full.charCodeAt(maxLen - 1) <= 0xdbff
    ? maxLen - 1
    : maxLen;
  return full.slice(0, cut);
}
