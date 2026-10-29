import {
  buildSafeActionRows,
  type CardReply,
  createActionButton,
  createPaginationRow,
  createStringSelectMenu,
  formatPageFooter,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
  row,
} from "@lumi/ui";
import { ButtonStyle } from "discord.js";
import {
  formatTimestamp,
  polarityIcon,
} from "../../permits/format.js";
import { formatPermitNodes } from "../../permits/nodes.js";
import { backButton, cut } from "../common.js";
import { paginate } from "../pages.js";
import type { PermitCardContext } from "./host.js";

const PermitPageSize = 6;
const ReorderPageSize = 3;
const SelectOptionLimit = 25;

function listErrorCard(title: string, body: string): CardReply {
  return makeErrorCard(title, body, {
    breadcrumbs: ["Admin", "Permits"],
    actionRows: buildSafeActionRows([
      row(backButton("permit_back_main", "Back to List")),
    ]),
  });
}

export function extraOwnerError(): CardReply {
  return listErrorCard(
    "Extra Owner",
    "Only bot owners can create, edit, assign, or delete a permit with `*`.",
  );
}

export function missingPermitCard(): CardReply {
  return listErrorCard(
    "Permit Not Found",
    "That permit no longer exists in this server.",
  );
}

export async function mainCard(
  context: PermitCardContext,
  page: number,
): Promise<CardReply> {
  const permits = await context.permitRepo.listPermits(context.guildId);

  if (permits.length === 0) {
    return makeEmptyCard(
      "No permits yet",
      "This server has no permits configured.",
      "Create a permit with the button below.",
      {
        breadcrumbs: ["Admin", "Permits"],
        actionRows: buildSafeActionRows([
          row(
            createActionButton({
              customId: "permit_create",
              label: "Create Permit",
              style: ButtonStyle.Primary,
              emoji: "➕",
            }),
            createActionButton({
              customId: "permit_explain",
              label: "Explain Check",
              style: ButtonStyle.Secondary,
              emoji: "🔍",
            }),
          ),
        ]),
        footer: "0 permits",
      },
    );
  }

  const builtinCount = permits.filter((permit) => permit.builtin).length;
  const {
    items: visible,
    page: currentPage,
    totalPages,
  } = paginate(permits, page, PermitPageSize);

  const lines = visible.map((permit) => {
    const assigned = permit.assignments?.length ?? 0;
    const expiry = permit.expiresAt
      ? ` · expires ${formatTimestamp(permit.expiresAt)}`
      : "";
    return `• ${permit.builtin ? "🔒" : "⚙️"} **#${permit.number} ${permit.name}** — ${formatPermitNodes(permit.nodes, 2)} · ${polarityIcon(permit.polarity)} ${permit.polarity} · ${assigned} assigned${expiry}`;
  });

  const selectOptions = visible.slice(0, SelectOptionLimit).map((permit) => ({
    label: cut(
      `#${permit.number} ${permit.name}${permit.builtin ? " (builtin)" : ""}`,
      100,
    ),
    value: String(permit.id),
    description: cut(
      `${formatPermitNodes(permit.nodes, 2)} · ${permit.polarity}`,
      100,
    ),
    emoji: permit.builtin ? "🔒" : "⚙️",
  }));

  const actionRows = buildSafeActionRows([
    row(
      createStringSelectMenu({
        customId: "permit_select",
        placeholder: "Select a permit to manage",
        options: selectOptions,
      }),
    ),
    row(
      createActionButton({
        customId: "permit_create",
        label: "Create Permit",
        style: ButtonStyle.Primary,
        emoji: "➕",
      }),
      createActionButton({
        customId: "permit_explain",
        label: "Explain Check",
        style: ButtonStyle.Secondary,
        emoji: "🔍",
      }),
      createActionButton({
        customId: "permit_reorder",
        label: "Reorder",
        style: ButtonStyle.Secondary,
        emoji: "↕️",
      }),
    ),
    ...(totalPages > 1
      ? [
          createPaginationRow({
            customIdPrefix: "permit_page",
            currentPage,
            totalPages,
          }),
        ]
      : []),
  ]);

  return makeCard(undefined, "Permit Management", [
    ...lines,
    "-# Select a permit below to view, edit, or manage its assignments.",
  ], {
    subtitle: `${builtinCount} built-in · ${permits.length - builtinCount} custom · ${permits.length} total`,
    breadcrumbs: ["Admin", "Permits"],
    footer: formatPageFooter(currentPage, totalPages, permits.length),
    actionRows,
  });
}

export async function reorderCard(
  context: PermitCardContext,
  page: number,
): Promise<CardReply> {
  const permits = await context.permitRepo.listPermits(context.guildId);
  if (permits.length === 0) return mainCard(context, 0);

  const {
    items: visible,
    page: currentPage,
    totalPages,
  } = paginate(permits, page, ReorderPageSize);
  const start = currentPage * ReorderPageSize;
  const reorderable = permits.filter((permit) => !permit.builtin);

  const lines = visible.map((permit, index) => {
    return `**${start + index + 1}.** ${permit.builtin ? "🔒" : "⚙️"} **#${permit.number} ${permit.name}** — ${formatPermitNodes(permit.nodes, 2)} · ${polarityIcon(permit.polarity)} ${permit.polarity}`;
  });

  const permitRows = visible.map((permit) => {
    const reorderIndex = reorderable.findIndex(
      (candidate) => candidate.id === permit.id,
    );
    const canReorder = !permit.builtin && reorderIndex !== -1;
    return row(
      createActionButton({
        customId: `permit_move:up:${permit.id}:${currentPage}`,
        label: "Up",
        style: ButtonStyle.Secondary,
        emoji: "⬆️",
        disabled: !canReorder || reorderIndex === 0,
      }),
      createActionButton({
        customId: `permit_move:down:${permit.id}:${currentPage}`,
        label: "Down",
        style: ButtonStyle.Secondary,
        emoji: "⬇️",
        disabled: !canReorder || reorderIndex === reorderable.length - 1,
      }),
      createActionButton({
        customId: `permit_view:${permit.id}`,
        label: "Open",
        style: ButtonStyle.Primary,
        emoji: "📂",
      }),
    );
  });

  const actionRows = buildSafeActionRows([
    ...permitRows,
    row(backButton("permit_back_main", "Back to Permits")),
    ...(totalPages > 1
      ? [
          createPaginationRow({
            customIdPrefix: "permit_reorder_page",
            currentPage,
            totalPages,
          }),
        ]
      : []),
  ]);

  return makeCard(
    undefined,
    "Reorder Permits",
    [
      ...lines,
      "-# Permits are checked in this order. Use Up and Down to change it.",
      "-# 🔒 Built-in permits are fixed and cannot be reordered.",
    ],
    {
      subtitle: "Earlier permits are evaluated first",
      breadcrumbs: ["Admin", "Permits", "Reorder"],
      footer: formatPageFooter(currentPage, totalPages, permits.length),
      actionRows,
    },
  );
}
