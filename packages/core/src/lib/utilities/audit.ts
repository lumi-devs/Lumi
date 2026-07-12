import type { User } from "discord.js";

export function formatAuditReason(
  actor: User,
  reason: string | null,
  maxLen = 512,
): string {
  const prefix = `[${actor.tag} | ${actor.id}] `;
  return (prefix + (reason ?? "No reason provided.")).slice(0, maxLen);
}
