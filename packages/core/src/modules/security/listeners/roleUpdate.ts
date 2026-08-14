import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { AuditLogEvent, type Role } from "discord.js";
import { isNullish } from "@sapphire/utilities";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetService } from "#lib/module-system/Service.js";
import { swallow } from "#lib/utilities/errors.js";
import { DANGEROUS_PERMISSIONS } from "../services/SecurityService.js";
import { resolveAuditLogExecutor } from "../lib/audit.js";

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

    const grantedDangerous = DANGEROUS_PERMISSIONS.filter(
      (bit) => newRole.permissions.has(bit) && !oldRole.permissions.has(bit),
    );
    if (grantedDangerous.length === 0) return;

    const security = tryGetService("security");
    if (!security) return;

    // Revert immediately - @everyone holding any of these is a live hole,
    // independent of whether anti-nuke is even enabled.
    await newRole.setPermissions(
      oldRole.permissions,
      "Security: reverted dangerous permission grant on @everyone",
    ).catch(swallow("Security: revert @everyone permissions"));

    const config = await security.loadAntiNukeConfig(newRole.guild.id);
    if (!config.enabled) return;

    const executorId = await resolveAuditLogExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    if (isNullish(executorId)) return;
    if (await security.isExempt(newRole.guild, executorId, config)) return;

    const count = await security.recordAction(
      newRole.guild,
      executorId,
      "dangerous_permission_grant",
      config,
    );
    if (count === null) return;

    this.container.logger.warn(
      `[security] Anti-nuke tripped in ${newRole.guild.id}: ${executorId} granted @everyone a dangerous permission ${count} time(s)`,
    );
    await security.respond(
      newRole.guild,
      executorId,
      "dangerous_permission_grant",
      count,
      config,
    );
  }

}
