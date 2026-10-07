import { Events } from "discord.js";
import { AuditLogEvent, type GuildMember } from "discord.js";
import type { Container } from "#lib/services.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import { swallow } from "#lib/utilities/errors.js";
import { resolveAuditLogExecutor } from "@lumi/application/services/security/audit.js";
import { evaluateNukeEvent, isQuarantined } from "@lumi/application/services/security/anti-nuke.js";

function roleSet(member: GuildMember): Set<string> {
  return new Set(member.roles.cache.keys());
}

function sameRoles(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export const SecurityGuildMemberUpdateListener = defineListener({
  name: "securityGuildMemberUpdate",
  event: Events.GuildMemberUpdate,
  module: "security",
  async execute(
    services: Container,
    oldMember: GuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    const before = roleSet(oldMember);
    const after = roleSet(newMember);
    if (sameRoles(before, after)) return;

    if (!(await isQuarantined(newMember.guild.id, newMember.id))) return;

    const quarantineRoleId = await services.db.config.getModuleConfig(
      newMember.guild.id,
      "mod",
      "quarantine_role_id",
    );
    if (typeof quarantineRoleId !== "string" || !quarantineRoleId) return;
    if (after.size === 1 && after.has(quarantineRoleId)) return;

    await newMember.roles
      .set([quarantineRoleId], "Security: quarantine hold - reverting unauthorized role change")
      .catch(swallow("Security: quarantine hold revert"));

    await evaluateNukeEvent(newMember.guild, "quarantine_bypass", () =>
      resolveAuditLogExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id),
    );
  },
});
