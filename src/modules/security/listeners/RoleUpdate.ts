import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { AuditLogEvent, type Role } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { swallow } from "#src/lib/utilities/Errors.js";
import { resolveAuditLogExecutor } from "#src/modules/security/services/Audit.js";
import { DangerousPermissions, evaluateNukeEvent } from "#src/modules/security/services/AntiNuke.js";

export const SecurityRoleUpdateListener = defineListener({
  name: "securityRoleUpdate",
  event: Events.GuildRoleUpdate,
  module: "security",
  async execute(_services: Container, oldRole: Role, newRole: Role): Promise<void> {
    if (newRole.id !== newRole.guild.roles.everyone.id) return;

    const grantedDangerous = DangerousPermissions.filter(
      (bit) => newRole.permissions.has(bit) && !oldRole.permissions.has(bit),
    );
    if (grantedDangerous.length === 0) return;

    await newRole.setPermissions(
      oldRole.permissions,
      "Security: reverted dangerous permission grant on @everyone",
    ).catch(swallow("Security: revert @everyone permissions"));

    await evaluateNukeEvent(newRole.guild, "dangerous_permission_grant", () =>
      resolveAuditLogExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id),
    );
  },
});
