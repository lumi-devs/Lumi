import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { AuditLogEvent, type GuildMember } from "discord.js";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import { swallow } from "#lib/utilities/errors.js";
import { resolveAuditLogExecutor } from "../lib/audit.js";

function roleSet(member: GuildMember): Set<string> {
  return new Set(member.roles.cache.keys());
}

function sameRoles(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

@ApplyOptions<ModuleListener.Options>({
  name: "securityGuildMemberUpdate",
  event: Events.GuildMemberUpdate,
  module: "security",
})
export class SecurityGuildMemberUpdateListener extends ModuleListener<
  typeof Events.GuildMemberUpdate
> {
  protected async handle(
    oldMember: GuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    const before = roleSet(oldMember);
    const after = roleSet(newMember);
    if (sameRoles(before, after)) return;

    const security = tryGetUtility("security");
    if (!security) return;
    if (!(await security.isQuarantined(newMember.guild.id, newMember.id))) return;

    const quarantineRoleId = await this.container.db.config.getModuleConfig(
      newMember.guild.id,
      "mod",
      "quarantine_role_id",
    );
    if (typeof quarantineRoleId !== "string" || !quarantineRoleId) return;
    if (after.size === 1 && after.has(quarantineRoleId)) return;

    await newMember.roles
      .set([quarantineRoleId], "Security: quarantine hold - reverting unauthorized role change")
      .catch(swallow("Security: quarantine hold revert"));

    await security.evaluateNukeEvent(newMember.guild, "quarantine_bypass", () =>
      resolveAuditLogExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id),
    );
  }

}
