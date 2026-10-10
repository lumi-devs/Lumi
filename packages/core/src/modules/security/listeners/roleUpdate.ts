import { Events } from "discord.js";
import type { Container } from "@lumi/lib/services.js";
import { AuditLogEvent, type Role } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { swallow } from "@lumi/lib/utilities/errors.js";
import { resolveAuditLogExecutor } from "@lumi/application/services/security/audit.js";
import { DangerousPermissions, evaluateNukeEvent } from "@lumi/application/services/security/anti-nuke.js";

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

    // Revert immediately - @everyone holding any of these is a live hole,
    // independent of whether anti-nuke is even enabled.
    await newRole.setPermissions(
      oldRole.permissions,
      "Security: reverted dangerous permission grant on @everyone",
    ).catch(swallow("Security: revert @everyone permissions"));

    await evaluateNukeEvent(newRole.guild, "dangerous_permission_grant", () =>
      resolveAuditLogExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id),
    );
  },
});
