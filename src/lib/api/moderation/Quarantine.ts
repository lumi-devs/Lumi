import { container } from "@lib/Services.js";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { tryParseJSON } from "@shared/Index.ts";
import { formatAuditReason } from "@utilities/AuditReason.js";
import { RedisKeys } from "@redis/Store.js";
import { logToChannel } from "@api/moderation/ModLog.js";
import { acquireRedisLock } from "@redis/Lock.js";

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

    const key = RedisKeys.quarantineState(guild.id, targetMember.id);
    const { release } = await acquireRedisLock(container.redis, `${key}:lock`);
    try {
      if (await container.redis.exists(key)) {
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

      await container.redis.set(
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

    const key = RedisKeys.quarantineState(guild.id, targetMember.id);
    const { release } = await acquireRedisLock(container.redis, `${key}:lock`);
    try {
      const saved = await container.redis.get(key);
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

      const permKey = RedisKeys.targetPermits(guild.id, "user", targetMember.id);
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
