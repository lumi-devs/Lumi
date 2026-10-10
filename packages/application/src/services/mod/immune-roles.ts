import type { Container } from "@lumi/lib/services.js";
import type { GuildMember } from "discord.js";
import { toStringArray } from "@lumi/lib/module-system/config-schema.js";

/**
 * True if `member` holds one of the `mod:immune_role_ids` configured for the
 * guild. Only automated escalation paths (heat timeouts/quarantine,
 * anti-nuke responses, warn-threshold auto-actions) check this - manual
 * staff commands (/ban, /warn, etc.) always work regardless.
 */
export async function isImmuneToAutomatedAction(
  services: Container,
  guildId: string,
  member: GuildMember,
): Promise<boolean> {
  const raw = await services.db.config.getModuleConfig(
    guildId,
    "mod",
    "immune_role_ids",
  );
  const immuneRoleIds = toStringArray(raw);
  if (immuneRoleIds.length === 0) return false;
  return immuneRoleIds.some((id) => member.roles.cache.has(id));
}
