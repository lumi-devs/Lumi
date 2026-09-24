import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { AuditLogEvent, type Role } from "discord.js";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { swallow } from "#lib/utilities/errors.js";
import { resolveAuditLogExecutor } from "../services/audit.js";
import { DangerousPermissions, evaluateNukeEvent } from "../services/anti-nuke.js";

@ApplyOptions<ModuleListener.Options>({
  name: "securityRoleUpdate",
  event: Events.GuildRoleUpdate,
  module: "security",
})
export class SecurityRoleUpdateListener extends ModuleListener<
  typeof Events.GuildRoleUpdate
> {
  protected async handle(oldRole: Role, newRole: Role): Promise<void> {
    if (newRole.id !== newRole.guild.roles.everyone.id) return;

    const grantedDangerous = DangerousPermissions.filter(
      (bit) => newRole.permissions.has(bit) && !oldRole.permissions.has(bit),
    );
    if (grantedDangerous.length === 0) return;

    // Revert immediately - @everyone holding any of these is a live hole,
    // independent of whether anti-nuke is even enabled.
    await newRole.setPermissions(
      oldRole.permissions,
      "Security: reverted dangerous permission grant on @everyone",
    ).catch(swallow("Security: revert @everyone permissions"));

    await evaluateNukeEvent(newRole.guild, "dangerous_permission_grant", () =>
      resolveAuditLogExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id),
    );
  }

}
