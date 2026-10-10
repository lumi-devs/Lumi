import type { User } from "discord.js";

export function formatAuditReason(
  actor: User,
  reason: string | null,
  maxLen = 512,
): string {
  const prefix = `[${actor.tag} | ${actor.id}] `;
  const full = prefix + (reason ?? "No reason provided.");
  if (full.length <= maxLen) return full;

  // Slicing mid-surrogate-pair leaves a lone surrogate, which throws in
  // encodeURIComponent when discord.js builds the X-Audit-Log-Reason header.
  const cut = full.charCodeAt(maxLen - 1) >= 0xd800 &&
    full.charCodeAt(maxLen - 1) <= 0xdbff
    ? maxLen - 1
    : maxLen;
  return full.slice(0, cut);
}
