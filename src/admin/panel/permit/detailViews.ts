import { ButtonStyle } from "discord.js";
import {
  AccentColors,
  buildSafeActionRows,
  confirmRow,
  createActionButton,
  createStringSelectMenu,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
  makeInfoCard,
  makeWarningCard,
  row,
  type CardReply,
} from "@lumi/ui";
import type { PermitAssignment } from "@lumi/permits";
import {
  formatPermitNodeLines,
} from "../../permits/nodes.js";
import {
  formatTimestamp,
  polarityIcon,
  targetMention,
  targetTypeLabel,
} from "../../permits/format.js";
import { cut } from "../common.js";
import type { PermitCardContext } from "./host.js";

const AssignmentPreviewLimit = 10;
const SelectOptionLimit = 25;
const ConditionPreviewLimit = 900;

function assignmentsFor(assignments: PermitAssignment[]): PermitAssignment[] {
  return [...assignments].sort(
    (left, right) => left.grantedAt.getTime() - right.grantedAt.getTime(),
  );
}

export async function detailCard(
  context: PermitCardContext,
  permitId: number,
): Promise<CardReply> {
  const permit = await context.permitRepo.getPermit(context.guildId, permitId);
  if (!permit) return context.missingPermitCard();

  const assignments = assignmentsFor(permit.assignments);

  const facts = [
    `**Nodes**\n${formatPermitNodeLines(permit.nodes)}`,
    `**Polarity** ${polarityIcon(permit.polarity)} ${permit.polarity}`,
    `**Built-in** ${permit.builtin ? "Yes" : "No"}`,
    `**Expires** ${permit.expiresAt ? formatTimestamp(permit.expiresAt) : "Never"}`,
    `**Schedule** ${
      permit.schedule
        ? `\`${permit.schedule}\`${permit.timezone ? ` (${permit.timezone})` : ""}`
        : "None"
    }`,
  ].join("\n");

  const assignmentLines =
    assignments.length === 0
      ? ["-# No assignments."]
      : assignments.slice(0, AssignmentPreviewLimit).map((assignment) => {
          const expiry = assignment.expiresAt
            ? ` · until ${formatTimestamp(assignment.expiresAt)}`
            : "";
          return `• ${targetMention(assignment.targetType, assignment.targetId)} · ${targetTypeLabel(assignment.targetType)}${expiry}`;
        });

  if (assignments.length > AssignmentPreviewLimit) {
    assignmentLines.push(
      `-# ...and ${assignments.length - AssignmentPreviewLimit} more assignment(s).`,
    );
  }

  const body = [facts, ["**Assignments**", ...assignmentLines].join("\n")];

  if (permit.conditions) {
    body.push(
      `**Conditions**\n\`\`\`json\n${cut(
        JSON.stringify(permit.conditions, null, 2),
        ConditionPreviewLimit,
      )}\n\`\`\``,
    );
  }

  const canManageExtraOwner = context.canManageExtraOwnerPermit(permit);
  const actionRows = buildSafeActionRows([
    row(
      createActionButton({
        customId: `permit_assign:${permit.id}`,
        label: "Assign",
        style: ButtonStyle.Success,
        emoji: "➕",
        disabled: !canManageExtraOwner,
      }),
      createActionButton({
        customId: `permit_unassign:${permit.id}`,
        label: "Unassign",
        style: ButtonStyle.Danger,
        emoji: "➖",
        disabled: assignments.length === 0 || !canManageExtraOwner,
      }),
      createActionButton({
        customId: `permit_edit:${permit.id}`,
        label: "Edit",
        style: ButtonStyle.Primary,
        emoji: "✏️",
        disabled: permit.builtin || !canManageExtraOwner,
      }),
      createActionButton({
        customId: `permit_delete:${permit.id}`,
        label: "Delete",
        style: ButtonStyle.Danger,
        emoji: "🗑️",
        disabled: permit.builtin || !canManageExtraOwner,
      }),
    ),
    row(
      createActionButton({
        customId: "permit_back_main",
        label: "Back to List",
        style: ButtonStyle.Secondary,
        emoji: "⬅️",
      }),
    ),
  ]);

  return makeCard(
    permit.polarity === "Grant" ? AccentColors.success : AccentColors.error,
    permit.name,
    body,
    {
      subtitle: permit.builtin ? "Built-in permit" : "Custom permit",
      breadcrumbs: ["Admin", "Permits", permit.name],
      footer: `Permit #${permit.number}`,
      actionRows,
    },
  );
}

export async function unassignCard(
  context: PermitCardContext,
  permitId: number,
): Promise<CardReply> {
  const permit = await context.permitRepo.getPermit(context.guildId, permitId);
  if (!permit) return context.missingPermitCard();
  if (!context.canManageExtraOwnerPermit(permit)) {
    return context.extraOwnerError();
  }

  const assignments = assignmentsFor(permit.assignments);

  if (assignments.length === 0) {
    return makeEmptyCard(
      "No Assignments",
      `**#${permit.number} ${permit.name}** has no assignments to remove.`,
      "Assign the permit first, then remove it here.",
      {
        breadcrumbs: ["Admin", "Permits", permit.name],
        actionRows: buildSafeActionRows([
          row(
            createActionButton({
              customId: `permit_view:${permit.id}`,
              label: "Back to Permit",
              style: ButtonStyle.Secondary,
              emoji: "⬅️",
            }),
          ),
        ]),
      },
    );
  }

  const options = assignments.slice(0, SelectOptionLimit).map((assignment) => ({
    label: cut(
      `${targetTypeLabel(assignment.targetType)}: ${assignment.targetId}`,
      100,
    ),
    value: `${assignment.targetType}:${assignment.targetId}`,
    description: cut(
      assignment.expiresAt
        ? `Expires ${new Date(assignment.expiresAt).toISOString()}`
        : `Granted by ${assignment.grantedBy}`,
      100,
    ),
    emoji:
      assignment.targetType === "USER"
        ? "👤"
        : assignment.targetType === "ROLE"
          ? "🎭"
          : "#️⃣",
  }));

  const moreNotice =
    assignments.length > SelectOptionLimit
      ? `-# Only the first ${SelectOptionLimit} of ${assignments.length} assignments are listed.`
      : undefined;

  return makeInfoCard(
    `Remove Assignment · #${permit.number} ${permit.name}`,
    moreNotice
      ? [moreNotice]
      : "Pick an assignment to remove from this permit.",
    {
      breadcrumbs: ["Admin", "Permits", permit.name, "Unassign"],
      divider: true,
      actionRows: buildSafeActionRows([
        row(
          createStringSelectMenu({
            customId: `permit_unassign_select:${permit.id}`,
            placeholder: "Select an assignment to remove",
            options,
          }),
        ),
        row(
          createActionButton({
            customId: `permit_view:${permit.id}`,
            label: "Back to Permit",
            style: ButtonStyle.Secondary,
            emoji: "⬅️",
          }),
        ),
      ]),
      footer: `${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`,
    },
  );
}

export async function deleteCard(
  context: PermitCardContext,
  permitId: number,
): Promise<CardReply> {
  const permit = await context.permitRepo.getPermit(context.guildId, permitId);
  if (!permit) return context.missingPermitCard();
  if (!context.canManageExtraOwnerPermit(permit)) {
    return context.extraOwnerError();
  }

  if (permit.builtin) {
    return makeErrorCard("Built-in Permit", "Built-in permits cannot be deleted.", {
      breadcrumbs: ["Admin", "Permits", permit.name],
      actionRows: buildSafeActionRows([
        row(
          createActionButton({
            customId: `permit_view:${permit.id}`,
            label: "Back to Permit",
            style: ButtonStyle.Secondary,
            emoji: "⬅️",
          }),
        ),
      ]),
    });
  }

  return makeWarningCard(
    "Delete Permit",
    [
      `Are you sure you want to delete **#${permit.number} ${permit.name}**?`,
      "This also removes every assignment attached to it and cannot be undone.",
    ],
    {
      breadcrumbs: ["Admin", "Permits", permit.name, "Delete"],
      actionRows: buildSafeActionRows([
        confirmRow({
          confirmId: `permit_confirm_delete:${permit.id}`,
          cancelId: `permit_view:${permit.id}`,
          confirmLabel: "Yes, Delete",
          cancelLabel: "Cancel",
        }),
      ]),
      footer: `Permit #${permit.number}`,
    },
  );
}
