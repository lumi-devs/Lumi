import type { PermitRepository } from "@lumi/permits";
import { type Client, PermissionFlagsBits } from "discord.js";

interface AdminAccessOptions {
  guildId: string;
  userId: string;
  roleIds: string[];
  guildOwnerId?: string | null;
  memberPermissions?: { has(permission: bigint): boolean } | null;
  /**
   * Discord client used by the permit evaluator. Kept structural so callers
   * (and tests) can supply the subset the evaluator reads.
   */
  client?: unknown;
  permits: PermitRepository;
}

interface MemberRoles {
  roles?: string[] | { cache?: { values(): IterableIterator<{ id: string }> } };
}

export function roleIdsFrom(
  member: MemberRoles | null | undefined,
  guildId: string,
): string[] {
  const roles = member?.roles;
  if (!roles) return [];
  if (Array.isArray(roles)) {
    return roles.filter((roleId) => roleId !== guildId);
  }
  const cached = roles.cache?.values();
  if (!cached) return [];
  return Array.from(cached, (role) => role.id).filter(
    (roleId) => roleId !== guildId,
  );
}

export async function hasAdminAccess(
  options: AdminAccessOptions,
): Promise<boolean> {
  if (options.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  const result = await options.permits.explainPermit(
    {
      guildId: options.guildId,
      userId: options.userId,
      roleIds: options.roleIds,
      guildOwnerId: options.guildOwnerId ?? undefined,
      permitNode: "admin.*",
    },
    options.client as Client | undefined,
  );

  return result.allowed;
}
