import { container } from "#src/lib/Services.js";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { tryParseJSON } from "#src/shared/Index.ts";
import { formatAuditReason } from "#src/lib/utilities/AuditReason.js";
import { ValkeyKeys } from "#src/lib/valkey/Store.js";
import { logToChannel } from "#src/lib/api/moderation/ModLog.js";
import { acquireValkeyLock } from "#src/lib/valkey/Lock.js";

interface QuarantineOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class QuarantineAction {
  public static async apply(options: QuarantineOptions) {
    const { guild, targetMember, moderator, reason } = options;

    const quarantineRoleId = await container.db.config.getModuleConfig(
      guild.id,
      "mod",
      "quarantine_role_id",
    );
    if (!quarantineRoleId || typeof quarantineRoleId !== "string") {
      throw new Error("UNCONFIGURED");
    }

    const key = ValkeyKeys.quarantineState(guild.id, targetMember.id);
    const { release } = await acquireValkeyLock(container.valkey, `${key}:lock`);
    try {
      if (await container.valkey.exists(key)) {
        throw new Error("ALREADY_QUARANTINED");
      }

      const staleCases = await container.db.moderation.getActiveCases(
        guild.id,
        targetMember.id,
        "quarantine",
      );
      await container.db.moderation.liftModerationCases(
        staleCases.map((c) => c.id),
      );

      const savedRoles = targetMember.roles.cache
        .filter((r) => r.id !== guild.id && r.id !== quarantineRoleId)
        .map((r) => r.id);

      await targetMember.roles.set(
        [quarantineRoleId],
        formatAuditReason(moderator, reason),
      );

      await container.valkey.set(
        key,
        JSON.stringify(savedRoles),
        "EX",
        30 * 24 * 60 * 60,
      );

      const c = await container.db.moderation.createModerationCase({
        guildId: guild.id,
        userId: targetMember.id,
        moderatorId: moderator.id,
        action: "quarantine",
        reason,
      });

      await logToChannel(
        container,
        guild.id,
        "🔒 Quarantined",
        Colors.Orange,
        targetMember.id,
        moderator,
        reason,
        c.caseNumber,
      );

      return c;
    } finally {
      await release();
    }
  }

  public static async undo(options: QuarantineOptions) {
    const { guild, targetMember, moderator, reason } = options;

    const key = ValkeyKeys.quarantineState(guild.id, targetMember.id);
    const { release } = await acquireValkeyLock(container.valkey, `${key}:lock`);
    try {
      const saved = await container.valkey.get(key);
      if (!saved) {
        throw new Error("NOT_QUARANTINED");
      }

      const parsedRoles = tryParseJSON(saved);
      if (!Array.isArray(parsedRoles)) {
        throw new Error("CORRUPTED_STATE");
      }
      const rolesToRestore = parsedRoles as string[];
      const validRoles = rolesToRestore.filter((id) => guild.roles.cache.has(id));

      await targetMember.roles.set(
        validRoles,
        formatAuditReason(moderator, reason),
      );

      const permKey = ValkeyKeys.targetPermits(guild.id, "user", targetMember.id);
      await container.invalidation.invalidate(key, permKey);

      const activeCases = await container.db.moderation.getActiveCases(
        guild.id,
        targetMember.id,
        "quarantine",
      );
      await container.db.moderation.liftModerationCases(
        activeCases.map((c) => c.id),
      );

      const c = await container.db.moderation.createModerationCase({
        guildId: guild.id,
        userId: targetMember.id,
        moderatorId: moderator.id,
        action: "unquarantine",
        reason,
      });

      await logToChannel(
        container,
        guild.id,
        "🔓 Released",
        Colors.Green,
        targetMember.id,
        moderator,
        reason,
        c.caseNumber,
      );

      return c;
    } finally {
      await release();
    }
  }
}
