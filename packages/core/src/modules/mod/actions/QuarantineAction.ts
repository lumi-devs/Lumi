import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { tryParseJSON } from "@sapphire/utilities";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { RedisKeys } from "#database/redis.js";
import { logToChannel } from "../lib/helpers.js";

export interface QuarantineApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export interface QuarantineUndoOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class QuarantineAction {
  public static async apply(options: QuarantineApplyOptions) {
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
    if (await container.redis.exists(key)) {
      throw new Error("ALREADY_QUARANTINED");
    }

    const staleCases = await container.db.moderation.getActiveCases(
      guild.id,
      targetMember.id,
      "quarantine",
    );
    for (const stale of staleCases) {
      await container.db.moderation.liftModerationCase(stale.id);
    }

    const savedRoles = targetMember.roles.cache
      .filter((r) => r.id !== guild.id && r.id !== quarantineRoleId)
      .map((r) => r.id);

    await targetMember.roles.set(
      [guild.id, quarantineRoleId],
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
      guild.id,
      "🔒 Quarantined",
      Colors.Orange,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }

  public static async undo(options: QuarantineUndoOptions) {
    const { guild, targetMember, moderator, reason } = options;

    const key = RedisKeys.quarantineState(guild.id, targetMember.id);
    const saved = await container.redis.get(key);
    if (!saved) {
      throw new Error("NOT_QUARANTINED");
    }

    const parsedRoles = tryParseJSON(saved);
    const rolesToRestore = Array.isArray(parsedRoles)
      ? (parsedRoles as string[])
      : [];
    const validRoles = rolesToRestore.filter((id) => guild.roles.cache.has(id));

    await targetMember.roles.set(
      [guild.id, ...validRoles],
      formatAuditReason(moderator, reason),
    );

    const permKey = RedisKeys.targetPermits(guild.id, "user", targetMember.id);
    if (container.invalidation) {
      await container.invalidation.invalidate(key);
      await container.invalidation.invalidate(permKey);
    } else {
      await container.redis.del(key, permKey);
    }

    const activeCases = await container.db.moderation.getActiveCases(
      guild.id,
      targetMember.id,
      "quarantine",
    );
    for (const active of activeCases) {
      await container.db.moderation.liftModerationCase(active.id);
    }

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetMember.id,
      moderatorId: moderator.id,
      action: "unquarantine",
      reason,
    });

    await logToChannel(
      guild.id,
      "🔓 Released",
      Colors.Green,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }
}
