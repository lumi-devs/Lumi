import type { LumiT } from "#lib/i18n/index.js";
import { row, type Row, formatPageFooter } from "#modules/core/ui/common.js";
import { hubTabRow } from "#modules/core/ui/hub.js";
import { Emojis } from "#lib/utilities/assets.js";
import { resolveCardColor } from "#lib/utilities/config.js";
import { makeCard, noPingCard, type CardReply } from "#lib/ui/cards.js";
import {
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  settingRow,
} from "#lib/ui/panels.js";
import {
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { roleMention, userMention } from "@discordjs/formatters";
import { ButtonStyle } from "discord.js";
import { HubPermitAssignId, HubPermitPickId } from "../constants.js";

export const PermsPerPage = 4;

export type PermitKind = "custom" | "enforced";
type PermitTargetType = "role" | "user";

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
      .setLabel(t ? t("panels:backToHub") : "Back")
      .setEmoji(Emojis.parse(Emojis.ArrowLeft))
      .setStyle(ButtonStyle.Secondary),
  );

export function buildPermissionsView(
  assignments: PermitAssignmentRow[],
  page = 0,
  t?: LumiT,
): CardReply {
  const totalPages = Math.max(1, Math.ceil(assignments.length / PermsPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = assignments.slice(
    safePage * PermsPerPage,
    (safePage + 1) * PermsPerPage,
  );

  const sections = shown.map((a) =>
    settingRow(
      [
        `${a.kind === "enforced" ? Emojis.Shield : Emojis.Check} ${a.permitName}${a.builtin ? " 🔒" : ""}`,
        `-# ${a.kind} · ${a.targetType} ${assignmentMention(a)}`,
      ],
      {
        customId: `lumi:permdel:${a.permitId}|${a.targetType}|${a.targetId}`,
        label: t ? t("panels:permsRevoke") : "Revoke",
        style: ButtonStyle.Danger,
      },
    ),
  );

  const addRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:custom")
      .setLabel(t ? t("panels:permsGrantCustom") : "Assign Custom…")
      .setEmoji(Emojis.parse(Emojis.Check))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:enforced")
      .setLabel(t ? t("panels:permsGrantEnforced") : "Assign Enforced…")
      .setEmoji(Emojis.parse(Emojis.Shield))
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
        ? t("panels:permsPageFooter", {
            page: safePage + 1,
            total: totalPages,
            count: assignments.length,
          })
        : formatPageFooter(safePage, totalPages, `${assignments.length} assignment(s)`)
      : t
        ? t("panels:permsCountFooter", { count: assignments.length })
        : `${assignments.length} assignment(s)`;

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `${Emojis.Shield} ${t ? t("panels:permsTitle") : "Permits"}`,
      shown.length
        ? `-# ${Emojis.Check} ${t ? t("panels:permsLegend") : "custom · enforced. Enforced permits survive anti-nuke quarantine."}`
        : t
          ? t("panels:permsEmpty")
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
      `${Emojis.Shield} ${t ? t("panels:permsPickPermit") : "Pick a Permit"}`,
      t
        ? t("panels:permsNoPermits")
        : "No permits of this kind exist yet. Create one with `/permit create` or from the dashboard.",
      { breadcrumbs: ["Hub", "Permissions", `Pick ${kindLabel} Permit`], actionRows: [backToPermissionsRow(t)] },
    );
  }

  const select = createStringSelectMenu({
    customId: HubPermitPickId.build({ kind }),
    placeholder: t ? t("panels:permsPickPermit") : "Pick a permit…",
    options: permits.slice(0, 25).map((p) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(p.builtin ? `${p.name} (built-in)` : p.name)
        .setValue(String(p.id)),
    ),
  });

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.Shield} ${t ? t("panels:permsPickPermit") : "Pick a Permit"}`,
    t
      ? t("panels:permsPickPermit")
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
          customId: HubPermitAssignId.build({ permitId: String(permitId) }),
          placeholder: t ? t("panels:permsPickTarget") : "Pick a member…",
        })
      : createRoleSelectMenu({
          customId: HubPermitAssignId.build({ permitId: String(permitId) }),
          placeholder: t ? t("panels:permsPickTarget") : "Pick a role…",
        });

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.Shield} ${permitName}`,
    t
      ? t("panels:permsPickTarget")
      : kind === "enforced"
        ? "Pick the member to assign this permit to."
        : "Pick the role to assign this permit to.",
    { breadcrumbs: ["Hub", "Permissions", permitName, "Pick Target"], actionRows: [row(select), backToPermissionsRow(t)] },
  );
}
