import type { PermitRepository } from "@lumi/permits";
import { type Client, PermissionFlagsBits } from "discord.js";

import type { ConfigService } from "./services/ConfigService.js";

export interface PermitAccessOptions {
  guildId: string;
  userId: string;
  roleIds: string[];
  channelId?: string;
  guildOwnerId?: string | null;
  enforcePermits?: boolean;

  client?: unknown;
  permits: PermitRepository;
}

interface AdminAccessOptions extends PermitAccessOptions {
  memberPermissions?: { has(permission: bigint): boolean } | null;
}

export async function permitEnforcementEnabled(
  config: Pick<ConfigService, "get">,
  guildId: string,
): Promise<boolean> {
  return (await config.get(guildId, "enforcePermits")) === true;
}

export async function hasPermitAccess(
  options: PermitAccessOptions,
  permitNode: string,
): Promise<boolean> {
  const result = await options.permits.explainPermit(
    {
      guildId: options.guildId,
      userId: options.userId,
      roleIds: options.roleIds,
      ...(options.channelId ? { channelId: options.channelId } : {}),
      guildOwnerId: options.guildOwnerId ?? undefined,
      permitNode,
      ...(options.enforcePermits ? { managerBypass: false } : {}),
    },
    options.client as Client | undefined,
  );

  return result.allowed;
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
  if (
    !options.enforcePermits &&
    options.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  return hasPermitAccess(options, "admin.*");
}
