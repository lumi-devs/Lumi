import type { Guild, GuildMember } from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import {
  planToggle,
  toggleBlockedMessage,
  type ReactionRoleMenu,
  type TogglePlan,
} from "../data.js";

export interface RoleToggleResult {
  plan: TogglePlan;
  applied: boolean;
  message: string;
}

function memberRoleIds(member: GuildMember): string[] {
  return [...member.roles.cache.keys()];
}

export async function applyOptionToggle(
  guild: Guild,
  member: GuildMember,
  menu: ReactionRoleMenu,
  optionId: string,
): Promise<RoleToggleResult> {
  const plan = planToggle({ menu, optionId, memberRoleIds: memberRoleIds(member) });
  if (plan.outcome === "blocked") {
    return { plan, applied: false, message: toggleBlockedMessage(menu, plan) };
  }
  if (plan.outcome === "remove") {
    await member.roles.remove(plan.roleId, "Reaction role toggle off").catch((err: unknown) => {
      logError("ReactionRoles: role remove failed", err);
      throw err;
    });
    const option = menu.options.find((o) => o.roleId === plan.roleId);
    return {
      plan,
      applied: true,
      message: `Removed **${option?.label ?? "role"}**.`,
    };
  }
  const role = guild.roles.cache.get(plan.roleId);
  if (!role) {
    return {
      plan: { outcome: "blocked", reason: "unknownOption", roleId: null },
      applied: false,
      message: "That role no longer exists on this server.",
    };
  }
  if (plan.removeRoleIds.length > 0) {
    await member.roles
      .remove(plan.removeRoleIds, "Reaction role exclusive swap")
      .catch((err: unknown) => logError("ReactionRoles: exclusive cleanup failed", err));
  }
  await member.roles.add(plan.roleId, "Reaction role toggle on").catch((err: unknown) => {
    logError("ReactionRoles: role add failed", err);
    throw err;
  });
  const option = menu.options.find((o) => o.roleId === plan.roleId);
  const swapped =
    plan.removeRoleIds.length > 0
      ? ` Replaced ${plan.removeRoleIds.length} other role(s) from this menu.`
      : "";
  return {
    plan,
    applied: true,
    message: `Added **${option?.label ?? role.name}**.${swapped}`,
  };
}

export async function applySelectToggle(
  guild: Guild,
  member: GuildMember,
  menu: ReactionRoleMenu,
  selectedOptionIds: string[],
): Promise<RoleToggleResult[]> {
  const results: RoleToggleResult[] = [];
  for (const optionId of selectedOptionIds.slice(0, 25)) {
    const fresh = await guild.members.fetch(member.id).catch(() => member);
    const result = await applyOptionToggle(guild, fresh, menu, optionId);
    results.push(result);
    if (result.plan.outcome === "blocked") break;
  }
  return results;
}
