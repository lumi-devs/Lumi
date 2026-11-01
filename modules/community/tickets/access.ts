import type { ModuleServices } from "@lumi/module-kit";
import {
  type APIInteractionGuildMember,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import type { TicketsConfig } from "./config.js";

type AnyMember = GuildMember | APIInteractionGuildMember | null | undefined;

export interface AccessContext {
  guildId: string;
  guildOwnerId?: string | null;
  userId: string;
  roleIds: string[];
  channelId?: string | null;
  permissions?: readonly string[] | null;
}

export interface TicketAccess {
  isStaff: boolean;
  isAdmin: boolean;
}

export function roleIdsOf(member: AnyMember): string[] {
  if (!member) return [];
  const roles: unknown = member.roles;
  if (Array.isArray(roles)) {
    return roles.filter((role): role is string => typeof role === "string");
  }
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? [...cache.keys()] : [];
}

export function hasDiscordManager(
  member: AnyMember,
  ownerId?: string | null,
  userId?: string,
): boolean {
  if (ownerId && userId && ownerId === userId) return true;
  const permissions = member?.permissions;
  if (!permissions || typeof permissions === "string") return false;
  return (
    permissions.has(PermissionFlagsBits.Administrator) ||
    permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

async function hasPermit(
  services: ModuleServices,
  context: AccessContext,
  node: string,
): Promise<boolean> {
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: context.guildId,
        userId: context.userId,
        roleIds: context.roleIds,
        ...(context.channelId ? { channelId: context.channelId } : {}),
        ...(context.guildOwnerId ? { guildOwnerId: context.guildOwnerId } : {}),
        permitNode: node,
      },
      services.client,
    );
    return result?.allowed === true;
  } catch (error) {
    services.observability?.logger?.warn?.("tickets permit check failed", {
      guildId: context.guildId,
      userId: context.userId,
      node,
      error,
    });
    return false;
  }
}

export function accessContextFromInteraction(interaction: {
  guildId?: string | null;
  guild?: Guild | null;
  user: { id: string };
  member?: AnyMember;
  channelId?: string | null;
  memberPermissions?: { has(permission: bigint): boolean } | null;
}): AccessContext | null {
  if (!interaction.guildId) return null;
  const member = interaction.member as AnyMember;
  const permissionNames: string[] = [];
  const permissions = interaction.memberPermissions ?? member?.permissions;
  if (permissions && typeof permissions !== "string") {
    if (permissions.has(PermissionFlagsBits.Administrator)) {
      permissionNames.push("Administrator");
    }
    if (permissions.has(PermissionFlagsBits.ManageGuild)) {
      permissionNames.push("ManageGuild");
    }
  }
  return {
    guildId: interaction.guildId,
    guildOwnerId: interaction.guild?.ownerId ?? null,
    userId: interaction.user.id,
    roleIds: roleIdsOf(member),
    channelId: interaction.channelId ?? null,
    permissions: permissionNames,
  };
}

export function createAccessContext(
  guild: Guild,
  member: GuildMember,
  channelId?: string | null,
): AccessContext {
  return {
    guildId: guild.id,
    guildOwnerId: guild.ownerId,
    userId: member.id,
    roleIds: roleIdsOf(member),
    channelId: channelId ?? null,
  };
}

function hasPermission(ctx: AccessContext, permission: string): boolean {
  return ctx.permissions?.includes(permission) === true;
}

function isOwner(ctx: AccessContext): boolean {
  return Boolean(ctx.guildOwnerId && ctx.guildOwnerId === ctx.userId);
}

export async function isTicketAdmin(
  services: ModuleServices,
  context: AccessContext,
): Promise<boolean> {
  if (isOwner(context)) return true;
  if (
    hasPermission(context, "Administrator") ||
    hasPermission(context, "ManageGuild")
  ) {
    return true;
  }
  return hasPermit(services, context, "tickets.admin");
}

export async function isTicketStaff(
  services: ModuleServices,
  context: AccessContext,
  config: TicketsConfig,
  categoryStaffRoleIds: readonly string[] = [],
): Promise<boolean> {
  if (await isTicketAdmin(services, context)) return true;
  const roleSet = new Set(context.roleIds);
  if (config.staffRoleIds.some((roleId) => roleSet.has(roleId))) return true;
  if (categoryStaffRoleIds.some((roleId) => roleSet.has(roleId))) return true;
  return hasPermit(services, context, "tickets.manage");
}

export async function ticketAccess(
  services: ModuleServices,
  context: AccessContext,
  config: TicketsConfig,
  categoryStaffRoleIds: readonly string[] = [],
): Promise<TicketAccess> {
  const isAdmin = await isTicketAdmin(services, context);
  if (isAdmin) return { isStaff: true, isAdmin: true };
  return {
    isStaff: await isTicketStaff(
      services,
      context,
      config,
      categoryStaffRoleIds,
    ),
    isAdmin: false,
  };
}
