import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { AuditLogEvent, type GuildMember } from "discord.js";
import { isNullish } from "@sapphire/utilities";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetService } from "#lib/module-system/Service.js";
import { swallow } from "#lib/utilities/errors.js";

const RECENT_AUDIT_ENTRY_MS = 10_000;

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

    const security = tryGetService("security");
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

    const config = await security.loadAntiNukeConfig(newMember.guild.id);
    if (!config.enabled) return;

    const executorId = await this.#resolveExecutor(newMember);
    if (isNullish(executorId)) return;
    if (await security.isExempt(newMember.guild, executorId, config)) return;

    const count = await security.recordAction(
      newMember.guild,
      executorId,
      "quarantine_bypass",
      config,
    );
    if (count === null) return;

    this.container.logger.warn(
      `[security] Anti-nuke tripped in ${newMember.guild.id}: ${executorId} tried to bypass ${newMember.id}'s quarantine ${count} time(s)`,
    );
    await security.respond(
      newMember.guild,
      executorId,
      "quarantine_bypass",
      count,
      config,
    );
  }

  async #resolveExecutor(member: GuildMember): Promise<string | null> {
    const logs = await member.guild
      .fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 })
      .catch(() => null);
    const entry = logs?.entries.first();
    if (
      !entry ||
      entry.targetId !== member.id ||
      Date.now() - entry.createdTimestamp > RECENT_AUDIT_ENTRY_MS
    ) {
      return null;
    }
    return entry.executorId;
  }
}
