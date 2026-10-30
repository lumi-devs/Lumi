import {
  type CardReply,
  createActionButton,
  createStringSelectMenu,
  makeCard,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import { ButtonStyle } from "discord.js";
import { RoleMenuIds } from "./ids.js";
import { assignReactionEmojis } from "./reactions.js";
import { formatTempDuration, type RoleMenuMode } from "./selection.js";

export type RoleMenuStyle = "buttons" | "select" | "reactions";

export interface MenuGroup {
  readonly id: string;
  readonly guildId: string;
  readonly name: string;
  readonly description: string | null;
  readonly mode: string;
  readonly requireOne: boolean;
  readonly autoToggle: boolean;
  readonly maxSelections: number | null;
  readonly tempDurationSeconds: number | null;
}

export interface MenuOption {
  readonly id: string;
  readonly groupId: string;
  readonly roleId: string;
  readonly label: string;
  readonly emoji: string | null;
  readonly description: string | null;
  readonly position: number;
}

export function groupMode(group: MenuGroup): RoleMenuMode {
  return group.mode === "single" ? "single" : "multiple";
}

export function optionsBody(
  group: MenuGroup,
  options: readonly MenuOption[],
): string[] {
  const lines = options.map((option) => {
    const emoji = option.emoji ? `${option.emoji} ` : "";
    const description = option.description ? ` — ${option.description}` : "";
    return `• ${emoji}**${option.label}** — <@&${option.roleId}>${description}`;
  });
  const limit =
    group.mode === "single"
      ? "One role"
      : group.maxSelections && group.maxSelections > 0
        ? `Up to ${group.maxSelections} roles`
        : "Any number of roles";
  return [
    group.description ?? "Choose the roles you want from the options below.",
    `**Selection** ${limit}${group.requireOne ? " · at least one required" : ""}${group.autoToggle ? " · toggle to remove" : ""}`,
    `**Temporary** ${formatTempDuration(group.tempDurationSeconds)}`,
    ...lines,
  ];
}

export function buildRoleMenuCard(
  group: MenuGroup,
  options: readonly MenuOption[],
  style: RoleMenuStyle,
): CardReply {
  const body = optionsBody(group, options);
  if (style === "reactions") {
    return makeCard(undefined, `🎭 ${group.name}`, body, {
      subtitle: "React to claim a role",
      footer: "Remove your reaction to give the role back",
    });
  }

  if (style === "select") {
    const maxValues =
      group.mode === "single"
        ? 1
        : Math.max(
            1,
            Math.min(
              options.length,
              group.maxSelections && group.maxSelections > 0
                ? group.maxSelections
                : options.length,
              25,
            ),
          );
    return makeCard(undefined, `🎭 ${group.name}`, body, {
      subtitle: "Select one or more roles",
      footer: "Use the menu below to update your roles",
      separatorAboveActionRows: true,
      actionRows: [
        row(
          createStringSelectMenu({
            customId: RoleMenuIds.select(group.id),
            placeholder: "Choose your roles...",
            minValues: 1,
            maxValues,
            options: options.map((option) => ({
              label: option.label,
              value: option.id,
              description: option.description ?? undefined,
              emoji: option.emoji ?? undefined,
            })),
          }),
        ),
      ],
    });
  }

  const rows = [];
  for (let index = 0; index < options.length; index += 5) {
    const slice = options.slice(index, index + 5);
    rows.push(
      row(
        ...slice.map((option) =>
          createActionButton({
            customId: RoleMenuIds.button(group.id, option.id),
            label: option.label,
            emoji: option.emoji ?? undefined,
            style: ButtonStyle.Secondary,
          }),
        ),
      ),
    );
  }

  return makeCard(undefined, `🎭 ${group.name}`, body, {
    subtitle: "Press a button to claim a role",
    footer: group.autoToggle
      ? "Press the same button again to give the role back"
      : "Roles stay until a staff member removes them",
    separatorAboveActionRows: true,
    actionRows: rows,
  });
}

export function reactionEmojis(options: readonly MenuOption[]): string[] {
  return assignReactionEmojis(options);
}

export function selectionSuccessCard(
  group: MenuGroup,
  addedRoleIds: readonly string[],
  removedRoleIds: readonly string[],
  temporary: boolean,
  refreshedRoleIds: readonly string[] = [],
): CardReply {
  const lines: string[] = [];
  if (addedRoleIds.length > 0) {
    lines.push(`**Added** ${addedRoleIds.map((id) => `<@&${id}>`).join(", ")}`);
  }
  if (removedRoleIds.length > 0) {
    lines.push(
      `**Removed** ${removedRoleIds.map((id) => `<@&${id}>`).join(", ")}`,
    );
  }
  if (lines.length === 0) {
    lines.push("Your roles already match this selection.");
  }
  if (refreshedRoleIds.length > 0) {
    lines.push(
      `**Expiry refreshed** ${refreshedRoleIds.map((id) => `<@&${id}>`).join(", ")}`,
    );
  }
  if (temporary && (addedRoleIds.length > 0 || refreshedRoleIds.length > 0)) {
    lines.push(
      `These roles expire after **${formatTempDuration(group.tempDurationSeconds)}**.`,
    );
  }
  return makeSuccessCard(`🎭 ${group.name}`, lines);
}

export function selectionErrorCard(
  group: MenuGroup,
  message: string,
): CardReply {
  return makeWarningCard(`🎭 ${group.name}`, message);
}

export function roleMenuListCard(lines: readonly string[]): CardReply {
  return makeListCard("🎭 Role Menus", [...lines], {
    footer: "Use /rolemenu post to publish a menu",
  });
}

export function roleMenuInfoCard(
  title: string,
  lines: string | readonly string[],
): CardReply {
  return makeInfoCard(`🎭 ${title}`, [
    ...(typeof lines === "string" ? [lines] : lines),
  ]);
}
