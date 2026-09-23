import { container } from "@sapphire/framework";
import { isHexColor } from "#lib/message-content.js";
import { isSnowflakeId } from "#lib/utilities/misc.js";
import type { MessageDocumentV2 } from "@lumi/contracts";

export type ReactionRoleMode = "buttons" | "select" | "reactions";

const ReactionRoleModes: readonly ReactionRoleMode[] = [
  "buttons",
  "select",
  "reactions",
];

export interface ReactionRoleOption {
  id: string;
  label: string;
  emoji: string | null;
  description: string | null;
  roleId: string;
  requiredRoleId: string | null;
}

export interface ReactionRoleMenu {
  id: string;
  guildId: string;
  title: string;
  description: string | null;
  color: string | null;
  mode: ReactionRoleMode;
  exclusive: boolean;
  maxRoles: number;
  channelId: string | null;
  messageIds: string[];
  options: ReactionRoleOption[];
  richContent: MessageDocumentV2;
  createdAt: number;
  updatedAt: number;
}

const ReactionRoleLimits = {
  maxMenus: 25,
  titleMin: 1,
  titleMax: 100,
  descriptionMax: 1000,
  optionLabelMin: 1,
  optionLabelMax: 80,
  optionDescriptionMax: 100,
  emojiMax: 100,
  maxRolesMin: 1,
  maxRolesMax: 25,
  buttonsMaxOptions: 20,
  selectMaxOptions: 25,
  reactionsMaxOptions: 20,
} as const;

function isReactionRoleMode(value: string): value is ReactionRoleMode {
  return (ReactionRoleModes as readonly string[]).includes(value);
}

export function normalizeMenuId(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug.length > 0 ? slug : "roles";
}

export function maxOptionsForMode(mode: ReactionRoleMode): number {
  if (mode === "select") return ReactionRoleLimits.selectMaxOptions;
  if (mode === "reactions") return ReactionRoleLimits.reactionsMaxOptions;
  return ReactionRoleLimits.buttonsMaxOptions;
}

export interface MenuValidationError {
  field: string;
  message: string;
}

export function validateMenuDraft(input: {
  title: string;
  description?: string | null;
  color?: string | null;
  mode: string;
  exclusive?: boolean;
  maxRoles?: number;
}): MenuValidationError[] {
  const errors: MenuValidationError[] = [];
  const title = input.title.trim();
  if (
    title.length < ReactionRoleLimits.titleMin ||
    title.length > ReactionRoleLimits.titleMax
  ) {
    errors.push({
      field: "title",
      message: `Title must be ${ReactionRoleLimits.titleMin}-${ReactionRoleLimits.titleMax} characters.`,
    });
  }
  const description = (input.description ?? "").trim();
  if (description.length > ReactionRoleLimits.descriptionMax) {
    errors.push({
      field: "description",
      message: `Description must be at most ${ReactionRoleLimits.descriptionMax} characters.`,
    });
  }
  if (input.color != null && input.color.length > 0 && !isHexColor(input.color)) {
    errors.push({
      field: "color",
      message: "Color must be a hex value like #5865F2.",
    });
  }
  if (!isReactionRoleMode(input.mode)) {
    errors.push({ field: "mode", message: "Mode must be buttons, select, or reactions." });
  }
  const maxRoles = input.maxRoles ?? 1;
  if (
    !Number.isInteger(maxRoles) ||
    maxRoles < ReactionRoleLimits.maxRolesMin ||
    maxRoles > ReactionRoleLimits.maxRolesMax
  ) {
    errors.push({
      field: "maxRoles",
      message: `Max roles must be a whole number from ${ReactionRoleLimits.maxRolesMin} to ${ReactionRoleLimits.maxRolesMax}.`,
    });
  }
  return errors;
}

export function validateOptionDraft(input: {
  label: string;
  emoji?: string | null;
  description?: string | null;
  roleId: string;
  requiredRoleId?: string | null;
}): MenuValidationError[] {
  const errors: MenuValidationError[] = [];
  const label = input.label.trim();
  if (
    label.length < ReactionRoleLimits.optionLabelMin ||
    label.length > ReactionRoleLimits.optionLabelMax
  ) {
    errors.push({
      field: "label",
      message: `Label must be ${ReactionRoleLimits.optionLabelMin}-${ReactionRoleLimits.optionLabelMax} characters.`,
    });
  }
  const emoji = (input.emoji ?? "").trim();
  if (emoji.length > ReactionRoleLimits.emojiMax) {
    errors.push({
      field: "emoji",
      message: `Emoji must be at most ${ReactionRoleLimits.emojiMax} characters.`,
    });
  }
  const description = (input.description ?? "").trim();
  if (description.length > ReactionRoleLimits.optionDescriptionMax) {
    errors.push({
      field: "description",
      message: `Description must be at most ${ReactionRoleLimits.optionDescriptionMax} characters.`,
    });
  }
  if (!isSnowflakeId(input.roleId)) {
    errors.push({ field: "roleId", message: "Role must be a valid role ID." });
  }
  const requiredRoleId = (input.requiredRoleId ?? "").trim();
  if (requiredRoleId.length > 0 && !isSnowflakeId(requiredRoleId)) {
    errors.push({
      field: "requiredRoleId",
      message: "Required role must be a valid role ID.",
    });
  }
  if (requiredRoleId === input.roleId && input.roleId.length > 0) {
    errors.push({
      field: "requiredRoleId",
      message: "Required role cannot be the same as the granted role.",
    });
  }
  return errors;
}

type ToggleBlockReason =
  | "unknownOption"
  | "missingRequiredRole"
  | "maxRolesReached";

export type TogglePlan =
  | { outcome: "add"; roleId: string; removeRoleIds: string[] }
  | { outcome: "remove"; roleId: string }
  | { outcome: "blocked"; reason: ToggleBlockReason; roleId: string | null };

export function planToggle(input: {
  menu: ReactionRoleMenu;
  optionId: string;
  memberRoleIds: string[];
}): TogglePlan {
  const option = input.menu.options.find((o) => o.id === input.optionId);
  if (!option) return { outcome: "blocked", reason: "unknownOption", roleId: null };
  if (input.memberRoleIds.includes(option.roleId)) {
    return { outcome: "remove", roleId: option.roleId };
  }
  if (
    option.requiredRoleId &&
    !input.memberRoleIds.includes(option.requiredRoleId)
  ) {
    return { outcome: "blocked", reason: "missingRequiredRole", roleId: option.roleId };
  }
  const heldMenuRoleIds = input.menu.options
    .map((o) => o.roleId)
    .filter((roleId) => roleId !== option.roleId && input.memberRoleIds.includes(roleId));
  if (input.menu.exclusive) {
    return { outcome: "add", roleId: option.roleId, removeRoleIds: heldMenuRoleIds };
  }
  const maxRoles = Math.min(
    Math.max(input.menu.maxRoles, ReactionRoleLimits.maxRolesMin),
    ReactionRoleLimits.maxRolesMax,
  );
  if (heldMenuRoleIds.length >= maxRoles) {
    return { outcome: "blocked", reason: "maxRolesReached", roleId: option.roleId };
  }
  return { outcome: "add", roleId: option.roleId, removeRoleIds: [] };
}

export function toggleBlockedMessage(
  menu: ReactionRoleMenu,
  plan: Extract<TogglePlan, { outcome: "blocked" }>,
): string {
  if (plan.reason === "unknownOption") return "That option no longer exists on this menu.";
  if (plan.reason === "missingRequiredRole") {
    const option = menu.options.find((o) => o.roleId === plan.roleId);
    const required = option?.requiredRoleId;
    return required
      ? `You need <@&${required}> before you can claim this role.`
      : "You are missing the role required to claim this one.";
  }
  if (menu.exclusive) return "This menu only allows one role — pick a different one first.";
  return `You already hold the maximum of ${menu.maxRoles} role(s) from this menu. Remove one first.`;
}

export async function listMenus(guildId: string): Promise<ReactionRoleMenu[]> {
  return container.db.reactionRoles.listMenus(guildId);
}

export async function getMenu(
  guildId: string,
  menuId: string,
): Promise<ReactionRoleMenu | null> {
  return container.db.reactionRoles.getMenu(guildId, menuId);
}

export async function resolveMenuId(guildId: string, desired: string): Promise<string> {
  const base = normalizeMenuId(desired);
  if (!(await getMenu(guildId, base))) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`.slice(0, 40);
    if (!(await getMenu(guildId, candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 40);
}

export async function saveMenu(menu: ReactionRoleMenu): Promise<ReactionRoleMenu> {
  return container.db.reactionRoles.saveMenu(menu);
}

export async function deleteMenu(guildId: string, menuId: string): Promise<boolean> {
  return container.db.reactionRoles.deleteMenu(guildId, menuId);
}

export async function trackMenuMessage(
  menu: ReactionRoleMenu,
  channelId: string,
  messageId: string,
): Promise<ReactionRoleMenu> {
  return container.db.reactionRoles.trackMenuMessage(menu, channelId, messageId);
}

export async function findMenuByMessage(
  guildId: string,
  messageId: string,
): Promise<ReactionRoleMenu | null> {
  return container.db.reactionRoles.findMenuByMessage(guildId, messageId);
}

export async function countMenus(guildId: string): Promise<number> {
  return container.db.reactionRoles.countMenus(guildId);
}
