import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { row, type Row, formatPageFooter } from "#modules/core/ui/common.js";
import { hubTabRow } from "#modules/core/ui/hub.js";
import { Emojis } from "#utilities/assets.js";
import {
  resolveCardColor,
  makeCard,
  noPingCard,
  type CardReply,
} from "#utilities/cards.js";
import {
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  settingRow,
} from "#utilities/panels.js";
import {
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { roleMention, userMention } from "@discordjs/formatters";
import { ButtonStyle } from "discord.js";

export const PERMS_PER_PAGE = 4;

export type PermitKind = "custom" | "enforced";
export type PermitTargetType = "role" | "user";

export interface PermitAssignmentRow {
  permitId: number;
  permitName: string;
  kind: PermitKind;
  builtin: boolean;
  targetType: PermitTargetType;
  targetId: string;
}

const assignmentMention = (row: PermitAssignmentRow): string =>
  row.targetType === "role" ? roleMention(row.targetId) : userMention(row.targetId);

const backToPermissionsRow = (t?: LumiT): Row =>
  row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:permissions")
      .setLabel(t ? t(PanelsKeys.BackToHub) : "Back")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );

export function buildPermissionsView(
  assignments: PermitAssignmentRow[],
  page = 0,
  t?: LumiT,
): CardReply {
  const totalPages = Math.max(1, Math.ceil(assignments.length / PERMS_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = assignments.slice(
    safePage * PERMS_PER_PAGE,
    (safePage + 1) * PERMS_PER_PAGE,
  );

  const sections = shown.map((a) =>
    settingRow(
      [
        `${a.kind === "enforced" ? Emojis.SHIELD : Emojis.CHECK} ${a.permitName}${a.builtin ? " 🔒" : ""}`,
        `-# ${a.kind} · ${a.targetType} ${assignmentMention(a)}`,
      ],
      {
        customId: `lumi:permdel:${a.permitId}|${a.targetType}|${a.targetId}`,
        label: t ? t(PanelsKeys.PermsRevoke) : "Revoke",
        style: ButtonStyle.Danger,
      },
    ),
  );

  const addRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:custom")
      .setLabel(t ? t(PanelsKeys.PermsGrantCustom) : "Assign Custom…")
      .setEmoji(Emojis.parse(Emojis.CHECK))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:enforced")
      .setLabel(t ? t(PanelsKeys.PermsGrantEnforced) : "Assign Enforced…")
      .setEmoji(Emojis.parse(Emojis.SHIELD))
      .setStyle(ButtonStyle.Primary),
  );

  const rows: Row[] = [addRow];
  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: "lumi:permpage",
        currentPage: safePage,
        totalPages,
      }),
    );
  }
  rows.push(hubTabRow("permissions", t));

  const footer =
    totalPages > 1
      ? t
        ? t(PanelsKeys.PermsPageFooter, {
            page: safePage + 1,
            total: totalPages,
            count: assignments.length,
          })
        : formatPageFooter(safePage, totalPages, `${assignments.length} assignment(s)`)
      : t
        ? t(PanelsKeys.PermsCountFooter, { count: assignments.length })
        : `${assignments.length} assignment(s)`;

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `${Emojis.SHIELD} ${t ? t(PanelsKeys.PermsTitle) : "Permits"}`,
      shown.length
        ? `-# ${Emojis.CHECK} ${t ? t(PanelsKeys.PermsLegend) : "custom · enforced. Enforced permits survive anti-nuke quarantine."}`
        : t
          ? t(PanelsKeys.PermsEmpty)
          : "*No permits are assigned yet - every command uses its default access.*",
      { breadcrumbs: ["Hub", "Permissions"], sections, footer, actionRows: rows, separatorAboveActionRows: true },
    ),
  );
}

export function buildPermitPickerView(
  kind: PermitKind,
  permits: { id: number; name: string; builtin: boolean }[],
  t?: LumiT,
): CardReply {
  const kindLabel = kind === "custom" ? "Custom" : "Enforced";

  if (permits.length === 0) {
    return makeCard(
      resolveCardColor("primary"),
      `${Emojis.SHIELD} ${t ? t(PanelsKeys.PermsPickPermit) : "Pick a Permit"}`,
      t
        ? t(PanelsKeys.PermsNoPermits)
        : "No permits of this kind exist yet. Create one with `/permit create` or from the dashboard.",
      { breadcrumbs: ["Hub", "Permissions", `Pick ${kindLabel} Permit`], actionRows: [backToPermissionsRow(t)] },
    );
  }

  const select = createStringSelectMenu({
    customId: `lumi:permit:pick:${kind}`,
    placeholder: t ? t(PanelsKeys.PermsPickPermit) : "Pick a permit…",
    options: permits.slice(0, 25).map((p) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(p.builtin ? `${p.name} (built-in)` : p.name)
        .setValue(String(p.id)),
    ),
  });

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.SHIELD} ${t ? t(PanelsKeys.PermsPickPermit) : "Pick a Permit"}`,
    t
      ? t(PanelsKeys.PermsPickPermit)
      : "Pick which permit to assign.",
    { breadcrumbs: ["Hub", "Permissions", `Pick ${kindLabel} Permit`], actionRows: [row(select), backToPermissionsRow(t)] },
  );
}

export function buildPermitAssignTargetView(
  permitId: number,
  permitName: string,
  kind: PermitKind,
  t?: LumiT,
): CardReply {
  const select =
    kind === "enforced"
      ? createUserSelectMenu({
          customId: `lumi:permit:assign:${permitId}`,
          placeholder: t ? t(PanelsKeys.PermsPickTarget) : "Pick a member…",
        })
      : createRoleSelectMenu({
          customId: `lumi:permit:assign:${permitId}`,
          placeholder: t ? t(PanelsKeys.PermsPickTarget) : "Pick a role…",
        });

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.SHIELD} ${permitName}`,
    t
      ? t(PanelsKeys.PermsPickTarget)
      : kind === "enforced"
        ? "Pick the member to assign this permit to."
        : "Pick the role to assign this permit to.",
    { breadcrumbs: ["Hub", "Permissions", permitName, "Pick Target"], actionRows: [row(select), backToPermissionsRow(t)] },
  );
}
