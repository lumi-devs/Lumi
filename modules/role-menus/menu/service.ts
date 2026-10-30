import type { ModuleServices } from "@lumi/module-kit";
import type { Guild, GuildMember, Role } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import {
  planForcedRemoval,
  planSelection,
  tempRoleExpiry,
  type RoleMenuRules,
} from "./selection.js";
import { groupMode, type MenuGroup, type MenuOption } from "./ui.js";

export interface GroupRecord extends MenuGroup {
  readonly options: MenuOption[];
}

export interface MessageRecord {
  readonly id: string;
  readonly guildId: string;
  readonly groupId: string | null;
  readonly channelId: string;
  readonly messageId: string;
  readonly style: string;
}

export type ApplyResult =
  | {
      readonly ok: true;
      readonly addedRoleIds: readonly string[];
      readonly removedRoleIds: readonly string[];
      readonly refreshedRoleIds: readonly string[];
      readonly changed: boolean;
      readonly temporary: boolean;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export async function findGroup(
  services: ModuleServices,
  guildId: string,
  reference: string,
): Promise<GroupRecord | null> {
  return services.db.prisma.roleMenuGroup.findFirst({
    where: { guildId, OR: [{ id: reference }, { name: reference }] },
    include: { options: { orderBy: { position: "asc" } } },
  });
}

export async function findGroupById(
  services: ModuleServices,
  guildId: string,
  groupId: string,
): Promise<GroupRecord | null> {
  return services.db.prisma.roleMenuGroup.findFirst({
    where: { id: groupId, guildId },
    include: { options: { orderBy: { position: "asc" } } },
  });
}

export async function findMenuMessage(
  services: ModuleServices,
  messageId: string,
): Promise<MessageRecord | null> {
  return services.db.prisma.roleMenuMessage.findUnique({
    where: { messageId },
  });
}

export function rulesFor(
  group: MenuGroup,
  options: readonly MenuOption[],
): RoleMenuRules {
  return {
    mode: groupMode(group),
    requireOne: group.requireOne,
    autoToggle: group.autoToggle,
    maxSelections: group.maxSelections,
    optionRoleIds: options.map((option) => option.roleId),
  };
}

export function currentOptionRoleIds(
  member: GuildMember,
  options: readonly MenuOption[],
): string[] {
  return options
    .filter((option) => member.roles.cache.has(option.roleId))
    .map((option) => option.roleId);
}

export async function fetchMember(
  guild: Guild,
  userId: string,
): Promise<GuildMember | null> {
  return (
    guild.members.cache.get(userId) ??
    (await guild.members.fetch(userId).catch(() => null))
  );
}

function roleIssue(guild: Guild, role: Role): string | null {
  const me = guild.members.me;
  if (!me) return "I cannot inspect my server member.";
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "I need the **Manage Roles** permission to update roles.";
  }
  if (role.id === guild.id)
    return "The @everyone role cannot be a menu option.";
  if (role.managed) {
    return "That role is managed by an integration and cannot be assigned.";
  }
  if (role.position >= me.roles.highest.position) {
    return "That role is above or equal to my highest role.";
  }
  return null;
}

function memberIssue(guild: Guild, member: GuildMember): string | null {
  if (member.id === guild.ownerId) {
    return "The server owner's roles cannot be managed by a bot.";
  }
  const me = guild.members.me;
  if (!me) return "I cannot inspect my server member.";
  if (member.roles.highest.position >= me.roles.highest.position) {
    return "That member's highest role is above or equal to mine.";
  }
  return null;
}

async function resolveRoles(
  guild: Guild,
  roleIds: readonly string[],
): Promise<Map<string, Role>> {
  const resolved = new Map<string, Role>();
  for (const roleId of roleIds) {
    const role =
      guild.roles.cache.get(roleId) ??
      (await guild.roles.fetch(roleId).catch(() => null));
    if (role) resolved.set(roleId, role);
  }
  return resolved;
}

async function recordTempRole(
  services: ModuleServices,
  group: MenuGroup,
  userId: string,
  roleId: string,
): Promise<void> {
  const duration = group.tempDurationSeconds;
  if (!duration || duration <= 0) {
    await services.db.prisma.roleMenuTempRole
      .deleteMany({
        where: { guildId: group.guildId, userId, roleId },
      })
      .catch(() => undefined);
    return;
  }
  const expiresAt = tempRoleExpiry(new Date(), duration);
  if (!expiresAt) return;
  await services.db.prisma.roleMenuTempRole
    .upsert({
      where: {
        guildId_userId_roleId: {
          guildId: group.guildId,
          userId,
          roleId,
        },
      },
      update: { expiresAt },
      create: {
        guildId: group.guildId,
        userId,
        roleId,
        expiresAt,
      },
    })
    .catch((error: unknown) => {
      services.observability?.logger?.warn?.(
        "role menu temp role record failed",
        { guildId: group.guildId, userId, roleId, error },
      );
    });
}

async function clearTempRole(
  services: ModuleServices,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await services.db.prisma.roleMenuTempRole
    .deleteMany({ where: { guildId, userId, roleId } })
    .catch(() => undefined);
}

interface PlanInput {
  readonly addRoleIds: readonly string[];
  readonly removeRoleIds: readonly string[];
  readonly selectedRoleIds: readonly string[];
  readonly refreshRoleIds: readonly string[];
}

async function applyPlan(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  group: MenuGroup,
  plan: PlanInput,
): Promise<ApplyResult> {
  const changed = plan.addRoleIds.length > 0 || plan.removeRoleIds.length > 0;
  const temporary = Boolean(
    group.tempDurationSeconds && group.tempDurationSeconds > 0,
  );

  if (changed) {
    const memberProblem = memberIssue(guild, member);
    if (memberProblem) return { ok: false, message: memberProblem };
  }

  const roles = await resolveRoles(guild, [
    ...plan.addRoleIds,
    ...plan.removeRoleIds,
  ]);
  for (const roleId of [...plan.addRoleIds, ...plan.removeRoleIds]) {
    const role = roles.get(roleId);
    if (!role) {
      return {
        ok: false,
        message:
          "One of this menu's roles no longer exists. Ask staff to refresh the menu.",
      };
    }
    const issue = roleIssue(guild, role);
    if (issue) return { ok: false, message: issue };
  }

  const added: string[] = [];
  const removed: string[] = [];
  try {
    for (const roleId of plan.removeRoleIds) {
      await member.roles.remove(roleId, `Role menu: ${group.name}`);
      removed.push(roleId);
      await clearTempRole(services, group.guildId, member.id, roleId);
    }
    for (const roleId of plan.addRoleIds) {
      await member.roles.add(roleId, `Role menu: ${group.name}`);
      added.push(roleId);
      await recordTempRole(services, group, member.id, roleId);
    }
  } catch (error) {
    services.observability?.logger?.warn?.("role menu role update failed", {
      guildId: guild.id,
      userId: member.id,
      groupId: group.id,
      error,
    });
    return {
      ok: false,
      message:
        "I could not update all of your roles. Check my **Manage Roles** permission and role position.",
    };
  }

  const refreshed: string[] = [];
  if (temporary) {
    for (const roleId of plan.refreshRoleIds) {
      if (!plan.selectedRoleIds.includes(roleId)) continue;
      if (plan.addRoleIds.includes(roleId)) continue;
      await recordTempRole(services, group, member.id, roleId);
      refreshed.push(roleId);
    }
  }

  return {
    ok: true,
    addedRoleIds: added,
    removedRoleIds: removed,
    refreshedRoleIds: refreshed,
    changed: added.length > 0 || removed.length > 0,
    temporary,
  };
}

export async function applyRoleSelection(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  group: MenuGroup,
  options: readonly MenuOption[],
  requestedRoleIds: readonly string[],
): Promise<ApplyResult> {
  const current = currentOptionRoleIds(member, options);
  const plan = planSelection({
    rules: rulesFor(group, options),
    currentRoleIds: current,
    requestedRoleIds,
  });
  if (!plan.ok) return { ok: false, message: plan.message };

  const currentSet = new Set(current);
  const refreshRoleIds = group.tempDurationSeconds
    ? requestedRoleIds.filter((roleId) => currentSet.has(roleId))
    : [];

  return applyPlan(services, guild, member, group, {
    addRoleIds: plan.addRoleIds,
    removeRoleIds: plan.removeRoleIds,
    selectedRoleIds: plan.selectedRoleIds,
    refreshRoleIds,
  });
}

export async function applyForcedRoleRemoval(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  group: MenuGroup,
  options: readonly MenuOption[],
  roleId: string,
): Promise<ApplyResult> {
  const current = currentOptionRoleIds(member, options);
  const plan = planForcedRemoval(rulesFor(group, options), current, roleId);
  if (!plan.ok) return { ok: false, message: plan.message };

  return applyPlan(services, guild, member, group, {
    addRoleIds: plan.addRoleIds,
    removeRoleIds: plan.removeRoleIds,
    selectedRoleIds: plan.selectedRoleIds,
    refreshRoleIds: [],
  });
}
