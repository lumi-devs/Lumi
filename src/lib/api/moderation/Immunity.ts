import type { Container } from "#src/lib/Services.js";
import type { GuildMember } from "discord.js";
import { toStringArray } from "#src/lib/module-system/ConfigSchema.js";

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
