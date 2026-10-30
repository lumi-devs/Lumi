import { isSnowflake } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import type {
  APIInteractionGuildMember,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Role,
} from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { z } from "zod";

export function roleIdsOf(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
): string[] {
  if (!member) return [];
  const roles: unknown = member.roles;
  if (Array.isArray(roles)) {
    return roles.filter(
      (roleId): roleId is string => typeof roleId === "string",
    );
  }
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? [...cache.keys()] : [];
}

export function parseRoleIds(input: string | null | undefined): string[] {
  if (!input) return [];
  const ids = input.match(/\d{17,20}/g) ?? [];
  return [...new Set(ids.filter(isSnowflake))];
}

export function roleMentions(roleIds: readonly string[]): string {
  if (roleIds.length === 0) return "None";
  return roleIds.map((roleId) => `<@&${roleId}>`).join(", ");
}

export async function readConfig<T>(
  services: ModuleServices,
  guildId: string,
  key: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T> {
  let stored: unknown = null;
  try {
    stored = await services.config.get(guildId, key);
  } catch (error) {
    services.observability?.logger?.warn?.(`[${label}] config read failed`, {
      guildId,
      error,
    });
  }
  const parsed = schema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    `[${label}] invalid configuration, using defaults`,
    { guildId, issues: parsed.error.issues },
  );
  return schema.parse({});
}

export async function saveConfig<T>(
  services: ModuleServices,
  guildId: string,
  key: string,
  value: T,
): Promise<boolean> {
  if (typeof services.config.set !== "function") return false;
  try {
    await services.config.set(guildId, key, value);
    return true;
  } catch (error) {
    services.observability?.logger?.warn?.("[roles] config save failed", {
      guildId,
      key,
      error,
    });
    return false;
  }
}

export function hasManageServer(
  interaction: ChatInputCommandInteraction,
): boolean {
  if (!interaction.guildId) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  const permissions =
    interaction.memberPermissions ?? interaction.member?.permissions;
  if (!permissions || typeof permissions === "string") return false;
  return (
    permissions.has(PermissionFlagsBits.ManageGuild) ||
    permissions.has(PermissionFlagsBits.Administrator)
  );
}

export async function hasRolePermit(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  node: string,
): Promise<boolean> {
  if (!interaction.guildId) return false;
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleIds: roleIdsOf(interaction.member),
        channelId: interaction.channelId,
        guildOwnerId: interaction.guild?.ownerId,
        permitNode: node,
      },
      services.client,
    );
    return result?.allowed === true;
  } catch (error) {
    services.observability?.logger?.warn?.("[roles] permit check failed", {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      node,
      error,
    });
    return false;
  }
}

export async function canManageRolesCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  node: string,
): Promise<boolean> {
  if (hasManageServer(interaction)) return true;
  return hasRolePermit(interaction, services, node);
}

export interface RoleHierarchyInput {
  botIsOwner: boolean;
  botTopPosition: number;
  rolePosition: number;
  roleManaged?: boolean;
}

export type RoleHierarchyDecision =
  { allowed: true } | { allowed: false; reason: string };

export function canManageRole(
  input: RoleHierarchyInput,
): RoleHierarchyDecision {
  if (input.rolePosition <= 0) {
    return { allowed: false, reason: "The @everyone role cannot be managed." };
  }
  if (input.roleManaged) {
    return {
      allowed: false,
      reason: "That role is managed by an integration.",
    };
  }
  if (input.botIsOwner) return { allowed: true };
  if (input.botTopPosition > input.rolePosition) return { allowed: true };
  return {
    allowed: false,
    reason: "The bot needs a role higher than the target role.",
  };
}

export function roleFromGuild(guild: Guild, roleId: string): Role | null {
  return guild.roles.cache.get(roleId) ?? null;
}

export function canBotManageGuildRole(
  guild: Guild,
  bot: GuildMember | null,
  role: Role,
): RoleHierarchyDecision {
  return canManageRole({
    botIsOwner: bot?.id === guild.ownerId,
    botTopPosition: bot?.roles.highest.position ?? 0,
    rolePosition: role.position,
    roleManaged: role.managed,
  });
}

export async function botMember(guild: Guild): Promise<GuildMember | null> {
  if (guild.members.me) return guild.members.me;
  return guild.members.fetchMe().catch(() => null);
}

export async function fetchMember(
  guild: Guild,
  userId: string,
): Promise<GuildMember | null> {
  return guild.members.fetch(userId).catch(() => null);
}

export interface RoleChangeResult {
  changed: string[];
  failed: string[];
}

export async function addMemberRoles(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  roleIds: readonly string[],
  reason: string,
): Promise<RoleChangeResult> {
  const bot = await botMember(guild);
  const changed: string[] = [];
  const failed: string[] = [];
  for (const roleId of roleIds) {
    if (member.roles.cache.has(roleId)) continue;
    const role = roleFromGuild(guild, roleId);
    if (!role) {
      failed.push(roleId);
      continue;
    }
    const decision = canBotManageGuildRole(guild, bot, role);
    if (!decision.allowed) {
      failed.push(roleId);
      continue;
    }
    const added = await member.roles
      .add(role, reason)
      .then(() => true)
      .catch((error: unknown) => {
        services.observability?.logger?.warn?.("[roles] failed to add role", {
          guildId: guild.id,
          userId: member.id,
          roleId,
          error,
        });
        return false;
      });
    if (added) changed.push(roleId);
    else failed.push(roleId);
  }
  return { changed, failed };
}

export async function removeMemberRoles(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  roleIds: readonly string[],
  reason: string,
): Promise<RoleChangeResult> {
  const bot = await botMember(guild);
  const changed: string[] = [];
  const failed: string[] = [];
  for (const roleId of roleIds) {
    if (!member.roles.cache.has(roleId)) continue;
    const role = roleFromGuild(guild, roleId);
    if (!role) {
      failed.push(roleId);
      continue;
    }
    const decision = canBotManageGuildRole(guild, bot, role);
    if (!decision.allowed) {
      failed.push(roleId);
      continue;
    }
    const removed = await member.roles
      .remove(role, reason)
      .then(() => true)
      .catch((error: unknown) => {
        services.observability?.logger?.warn?.(
          "[roles] failed to remove role",
          { guildId: guild.id, userId: member.id, roleId, error },
        );
        return false;
      });
    if (removed) changed.push(roleId);
    else failed.push(roleId);
  }
  return { changed, failed };
}
