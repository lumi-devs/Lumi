import { container } from "#src/lib/Services.js";
import { formatAuditReason } from "#src/lib/utilities/AuditReason.js";
import { logToChannel } from "#src/lib/api/moderation/ModLog.js";
import { Colors } from "discord.js";
import type { Guild, GuildMember, User } from "discord.js";
import { acquireLock } from "#src/lib/cache/Lock.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";
import { CacheKeys, CacheTTL } from "#src/lib/cache/Keys.js";

export interface QuarantineInput {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export const QuarantineAction = {
  async apply({ guild, targetMember, moderator, reason }: QuarantineInput) {
    const quarantineRoleId = await container.db.config.getModuleConfig(
      guild.id,
      "mod",
      "quarantine_role_id",
    );
    if (!quarantineRoleId || typeof quarantineRoleId !== "string") {
      throw new Error("UNCONFIGURED");
    }

    const key = CacheKeys.quarantineState(guild.id, targetMember.id);
    const lock = await acquireLock(`${key}:lock`);
    try {
      if (cacheStore.has(key)) {
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

      cacheStore.set(key, JSON.stringify(savedRoles), 30 * CacheTTL.day);

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
      lock.release();
    }
  },

  async lift({ guild, targetMember, moderator, reason }: QuarantineInput) {
    const quarantineRoleId = await container.db.config.getModuleConfig(
      guild.id,
      "mod",
      "quarantine_role_id",
    );
    if (!quarantineRoleId || typeof quarantineRoleId !== "string") {
      throw new Error("UNCONFIGURED");
    }

    const key = CacheKeys.quarantineState(guild.id, targetMember.id);
    const lock = await acquireLock(`${key}:lock`);
    try {
      const saved = cacheStore.get<string>(key);
      const activeCases = await container.db.moderation.getActiveCases(
        guild.id,
        targetMember.id,
        "quarantine",
      );

      if (!saved && activeCases.length === 0) {
        throw new Error("NOT_QUARANTINED");
      }

      const rolesToRestore = saved ? (JSON.parse(saved) as string[]) : [];

      await targetMember.roles.set(
        rolesToRestore,
        formatAuditReason(moderator, reason),
      );

      cacheStore.delete(key);

      await container.db.moderation.liftModerationCases(
        activeCases.map((c) => c.id),
      );

      const latest = activeCases[0];
      await logToChannel(
        container,
        guild.id,
        "🔓 Quarantine Lifted",
        Colors.Green,
        targetMember.id,
        moderator,
        reason,
        latest?.caseNumber ?? 0,
      );
      return latest ?? { caseNumber: 0 };
    } finally {
      lock.release();
    }
  },
  undo(input: QuarantineInput) {
    return QuarantineAction.lift(input);
  },
};
