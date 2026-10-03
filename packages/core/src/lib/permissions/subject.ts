import type { Guild } from "discord.js";

/**
 * Extracts a member's role IDs, highest Discord role position first -
 * matching the precedence order PermitResolver walks roles in. The
 * @everyone role (always position 0, and whose ID always equals the guild's)
 * is deliberately kept, not filtered out: it's a real, independently
 * assignable custom-permit target (grant/deny "to everyone in this guild"),
 * and since it always sorts last, it doubles as the implicit server-wide
 * default tier without needing separate schema for one. Position data is
 * only available from a full GuildMember's role Collection (real
 * gateway/interaction runtime); the raw-array fallback (a partial/API member
 * shape, or a test double) has no position to sort by and is returned as-is.
 */
export function memberRoleIds(member: unknown, guildId?: string): string[] {
  if (!member || typeof member !== "object") return guildId ? [guildId] : [];
  const roles = (member as { roles?: unknown }).roles;

  if (Array.isArray(roles)) {
    const ids = roles as string[];
    return guildId && !ids.includes(guildId) ? [...ids, guildId] : ids;
  }

  const cache = (roles as { cache?: unknown })?.cache;
  if (cache instanceof Map) {
    const list = Array.from(cache as Map<string, { position?: number }>)
      .sort(([, a], [, b]) => (b.position ?? -1) - (a.position ?? -1))
      .map(([id]) => id);
    return guildId && !list.includes(guildId) ? [...list, guildId] : list;
  }
  if (cache && typeof cache === "object") {
    const list = Object.keys(cache);
    return guildId && !list.includes(guildId) ? [...list, guildId] : list;
  }
  return guildId ? [guildId] : [];
}

export interface PermitSubject {
  guildId: string;
  userId: string;
  roleIds: string[];
  channelId: string | undefined;
  guildOwnerId: string | undefined;
}

export function permitSubject(
  guild: Pick<Guild, "id" | "ownerId"> | null,
  userId: string,
  member: unknown,
  channelId: string | null,
): PermitSubject | null {
  if (!guild) return null;
  return {
    guildId: guild.id,
    userId,
    roleIds: memberRoleIds(member, guild.id),
    channelId: channelId ?? undefined,
    guildOwnerId: guild.ownerId,
  };
}
