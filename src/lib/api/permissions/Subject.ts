import type { Guild } from "discord.js";

export function memberRoleIds(member: unknown): string[] {
  if (!member || typeof member !== "object") return [];
  const roles = (member as { roles?: unknown }).roles;

  if (Array.isArray(roles)) return roles as string[];

  const cache = (roles as { cache?: unknown })?.cache;
  if (cache instanceof Map) {
    return Array.from(cache as Map<string, { position?: number }>)
      .sort(([, a], [, b]) => (b.position ?? -1) - (a.position ?? -1))
      .map(([id]) => id);
  }
  if (cache && typeof cache === "object") {
    return Object.keys(cache);
  }
  return [];
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
    roleIds: memberRoleIds(member),
    channelId: channelId ?? undefined,
    guildOwnerId: guild.ownerId,
  };
}
