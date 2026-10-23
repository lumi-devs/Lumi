import type { GuildMember } from "discord.js";
import type { LumiServices } from "@lumi/module-kit";
import { withLock } from "@lumi/redis";
import { getModConfig } from "./config.ts";

const QuarantineTtlSeconds = 30 * 86_400;
const LockTtlMs = 15_000;

export type QuarantineErrorCode =
  | "unconfigured"
  | "already-quarantined"
  | "not-quarantined"
  | "role-hierarchy"
  | "role-missing";

export class QuarantineError extends Error {
  public readonly code: QuarantineErrorCode;

  public constructor(code: QuarantineErrorCode, message: string) {
    super(message);
    this.name = "QuarantineError";
    this.code = code;
  }
}

export interface QuarantineResult {
  /** False when the member was already quarantined. */
  readonly applied: boolean;
  readonly savedRoles: readonly string[];
}

export interface LiftQuarantineResult {
  readonly lifted: boolean;
  readonly restoredRoles: readonly string[];
}

function auditReason(moderatorId: string, reason: string | null): string {
  return reason ? `${reason} | By ${moderatorId}` : `Quarantine | By ${moderatorId}`;
}

function lockKey(services: LumiServices, guildId: string, userId: string): string {
  return `${services.keys.quarantine(guildId, userId)}:lock`;
}

function parseSavedRoles(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return null;
  }
}

async function resolveQuarantineRole(
  services: LumiServices,
  member: GuildMember,
): Promise<{ roleId: string; rolePosition: number }> {
  const config = await getModConfig(services, member.guild.id).catch(() => null);
  if (!config?.quarantine_role_id) {
    throw new QuarantineError(
      "unconfigured",
      "Quarantine is not configured. Set `quarantine_role_id` in the mod module config first.",
    );
  }

  const role = await member.guild.roles.fetch(config.quarantine_role_id).catch(() => null);
  if (!role) {
    throw new QuarantineError(
      "role-missing",
      "The configured quarantine role no longer exists. Update `quarantine_role_id`.",
    );
  }

  const botHighest = member.guild.members.me?.roles.highest.position ?? 0;
  if (role.position >= botHighest) {
    throw new QuarantineError(
      "role-hierarchy",
      "The quarantine role must be below my highest role before I can assign it.",
    );
  }

  return { roleId: role.id, rolePosition: role.position };
}

/**
 * Saves the member's current roles, then replaces them with the configured
 * quarantine role. The Redis value is the saved role list so `/quarantine
 * remove` can restore the member instead of leaving them with every role
 * stripped.
 */
export async function applyQuarantine(
  services: LumiServices,
  member: GuildMember,
  options: {
    moderatorId: string;
    reason?: string | null | undefined;
    /** Re-apply the role after a rejoin without overwriting saved roles. */
    reapply?: boolean | undefined;
  },
): Promise<QuarantineResult> {
  const { guild } = member;
  const key = services.keys.quarantine(guild.id, member.id);
  const { roleId } = await resolveQuarantineRole(services, member);

  const locked = await withLock(services.redis, lockKey(services, guild.id, member.id), LockTtlMs, async () => {
    const existing = await services.redis.get(key);

    if (options.reapply) {
      if (!existing) return { applied: false, savedRoles: [] };
      await member.roles.set([roleId], auditReason(options.moderatorId, options.reason ?? "Rejoin"));
      return { applied: true, savedRoles: parseSavedRoles(existing) ?? [] };
    }

    if (existing !== null) {
      throw new QuarantineError("already-quarantined", "That member is already quarantined.");
    }

    const savedRoles = member.roles.cache
      .filter((role) => role.id !== guild.id && role.id !== roleId)
      .map((role) => role.id);

    // Write the state first: if Discord rejects the role change, the rollback
    // below removes the state instead of leaving a phantom quarantine flag.
    await services.redis.set(
      key,
      JSON.stringify(savedRoles),
      "EX",
      QuarantineTtlSeconds,
    );

    try {
      await member.roles.set([roleId], auditReason(options.moderatorId, options.reason ?? null));
    } catch (error) {
      await services.redis.del(key).catch(() => undefined);
      throw error;
    }

    return { applied: true, savedRoles };
  });

  if (!locked.acquired) {
    throw new QuarantineError(
      "already-quarantined",
      "Another quarantine change is already running for that member. Try again in a moment.",
    );
  }

  return locked.value;
}

export async function liftQuarantine(
  services: LumiServices,
  member: GuildMember,
  options: { moderatorId: string; reason?: string | null | undefined },
): Promise<LiftQuarantineResult> {
  const { guild } = member;
  const key = services.keys.quarantine(guild.id, member.id);
  const config = await getModConfig(services, guild.id).catch(() => null);
  const quarantineRoleId = config?.quarantine_role_id ?? null;

  const locked = await withLock(services.redis, lockKey(services, guild.id, member.id), LockTtlMs, async () => {
    const raw = await services.redis.get(key);
    if (raw === null) {
      throw new QuarantineError("not-quarantined", "That member is not quarantined.");
    }

    const savedRoles = parseSavedRoles(raw);
    let restoredRoles: string[] = [];

    if (savedRoles === null) {
      // State written by an older build (for example the literal "1"). We know
      // the quarantine role but not the original roles, so remove only that
      // role instead of wiping every other role on the member.
      if (quarantineRoleId) {
        await member.roles.remove(
          quarantineRoleId,
          auditReason(options.moderatorId, options.reason ?? "Released"),
        );
      }
      restoredRoles = member.roles.cache
        .filter((role) => role.id !== guild.id && role.id !== quarantineRoleId)
        .map((role) => role.id);
    } else {
      restoredRoles = savedRoles.filter((id) => guild.roles.cache.has(id));
      await member.roles.set(
        restoredRoles,
        auditReason(options.moderatorId, options.reason ?? "Released"),
      );
    }

    await services.redis.del(key);
    return { lifted: true, restoredRoles };
  });

  if (!locked.acquired) {
    throw new QuarantineError(
      "not-quarantined",
      "Another quarantine change is already running for that member. Try again in a moment.",
    );
  }

  return locked.value;
}

export async function isQuarantined(
  services: LumiServices,
  guildId: string,
  userId: string,
): Promise<boolean> {
  return services.redis.get(services.keys.quarantine(guildId, userId)).then(Boolean).catch(() => false);
}
