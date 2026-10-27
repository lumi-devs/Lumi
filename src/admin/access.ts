import { PermissionFlagsBits } from "discord.js";
import type { PermitRepository } from "@lumi/permits";

export interface AdminAccessOptions {
  guildId: string;
  userId: string;
  roleIds: string[];
  guildOwnerId?: string | null;
  memberPermissions?: { has(permission: bigint): boolean } | null;
  client?: any;
  permits: PermitRepository;
}

export function roleIdsFrom(member: any, guildId: string): string[] {
  if (Array.isArray(member?.roles)) {
    return member.roles.filter((roleId: string) => roleId !== guildId);
  }
  const roles = member?.roles?.cache;
  if (!roles) return [];
  return Array.from(roles.values())
    .filter((role: any) => role.id !== guildId)
    .map((role: any) => role.id);
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
    options.client,
  );

  return result.allowed;
}
