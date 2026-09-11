import { chunk } from "@sapphire/utilities";
import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { sectionsOf } from "@lumi/contracts";
import {
  FieldType,
  type ConfigField,
  type ModuleMeta,
} from "#lib/module-system/Module.js";
import {
  formatFieldValue,
  formatPageFooter,
  formatSubtitle,
  row,
  type Row,
} from "#modules/core/ui/common.js";
import { hubTabRow } from "#modules/core/ui/hub.js";
import { Emojis } from "#utilities/assets.js";
import {
  resolveCardColor,
  makeCard,
  noPingCard,
  type CardReply,
} from "#utilities/cards.js";
import {
  buildSafeActionRows,
  createActionButton,
  createBackButton,
  createChannelSelectMenu,
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  settingRow,
} from "#utilities/panels.js";
import { StringSelectMenuOptionBuilder } from "@discordjs/builders";
import { cutText } from "@sapphire/utilities";
import { ButtonStyle, ChannelType } from "discord.js";

// Each settingRow is a Section with up to 2 text lines + 1 button = ~4 real
// components once nested; card chrome (breadcrumbs/title/separator/status)
// eats ~17 of Discord's 40-component budget, so chrome ~17 + 4N stays under
// the cap with N = FieldsPerPage.
export const FeaturesPerPage = 4;
export const FieldsPerPage = 5;
const MaxSelectOptions = 25;
const MaxMultiValues = 25;

export interface FeatureListEntry {
  meta: ModuleMeta;
  guildEnabled: boolean;
}

const formatStatusBadge = (status: "enabled" | "disabled", t?: LumiT) =>
  status === "enabled"
    ? `${Emojis.Success} \`${t ? t(PanelsKeys.DetailEnabled) : "ENABLED"}\``
    : `${Emojis.Error} \`${t ? t(PanelsKeys.DetailDisabled) : "DISABLED"}\``;

/** True when the stored value (or schema default) counts as configured. */
const hasStoredValue = (field: ConfigField, value: unknown): boolean => {
  const current = value ?? field.default ?? null;
  if (current === null || current === "") return false;
  if (Array.isArray(current)) return current.length > 0;
  return true;
};

/** Per-field status glyph for the detail row headline. */
const statusGlyphFor = (field: ConfigField, value: unknown): string => {
  if (field.type === FieldType.Boolean) {
    const fallback =
      field.default === undefined ? false : Boolean(field.default);
    const current = value ?? fallback;
    return current ? Emojis.Check : Emojis.Cross;
  }
  return hasStoredValue(field, value) ? Emojis.Success : Emojis.Error;
};

/** ENUM fields with a bounded choice set render as an in-place select. */
const isEnumField = (field: ConfigField): boolean =>
  field.type === FieldType.Enum &&
  Array.isArray(field.choices) &&
  field.choices.length > 0;

/**
 * Free-text editors. NUMBER covers the slider variant (a NUMBER field with
 * `step`); on Discord every text-like field is edited through a modal input.
 */
const isTextField = (field: ConfigField): boolean =>
  field.type === FieldType.String ||
  field.type === FieldType.StringList ||
  field.type === FieldType.Number ||
  field.type === FieldType.Duration;

/** Detail headline: status glyph + name + current value, description below. */
const detailRowLines = (
  field: ConfigField,
  value: unknown,
  t?: LumiT,
): string[] => {
  const required =
    field.required === true
      ? ` *${t ? t(PanelsKeys.DetailRequired) : "(required)"}*`
      : "";
  return [
    `${statusGlyphFor(field, value)} **${field.label}**${required} - ${formatFieldValue(field, value)}`,
    ...(field.description ? [`-# ${cutText(field.description, 90)}`] : []),
  ];
};

/**
 * The modules tab: one row per guild-toggleable module, sorted by display name
 * and paginated at {@linkcode FeaturesPerPage}.
 *
 * @param page - Zero-based page index; out-of-range values are clamped.
 */
export function buildFeatureListView(
  features: FeatureListEntry[],
  page = 0,
  t?: LumiT,
): CardReply {
  const sorted = [...features].sort((a, b) =>
    a.meta.displayName.localeCompare(b.meta.displayName),
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / FeaturesPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * FeaturesPerPage;
  const pageFeatures = sorted.slice(start, start + FeaturesPerPage);

  const sections = pageFeatures.map((f) =>
    settingRow(
      [
        `${f.guildEnabled ? Emojis.Success : Emojis.Error} ${f.meta.emoji} **${f.meta.displayName}**`,
        `-# ${f.meta.description ? cutText(f.meta.description, 90) : "No description"}`,
      ],
      {
        customId: `cfg:open:${f.meta.name}:${safePage}`,
        label: t ? t(PanelsKeys.ModulesOpen) : "Open",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: Row[] = [];
  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: "cfg:page",
        currentPage: safePage,
        totalPages,
      }),
    );
  }
  rows.push(hubTabRow("modules", t));

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.Gear} ${t ? t(PanelsKeys.ModulesTitle) : "Feature Modules"}`,
    pageFeatures.length
      ? ""
      : t
        ? t(PanelsKeys.ModulesEmpty)
        : "*No features registered.*",
    {
      breadcrumbs: ["Hub", "Modules"],
      sections,
      footer:
        totalPages > 1
          ? t
            ? t(PanelsKeys.ModulesPageFooter, {
                page: safePage + 1,
                total: totalPages,
              })
            : formatPageFooter(safePage, totalPages, "Open a module to enable, disable, or configure it.")
          : t
            ? t(PanelsKeys.ModulesFooter)
            : "Open a module to enable, disable, or configure it.",
      actionRows: buildSafeActionRows(rows),
      separatorAboveActionRows: true,
    },
  );
}

interface FieldSection {
  name: string | null;
  fields: ConfigField[];
}

/**
 * Splits a module's fields into navigable sections: by explicit `group` when
 * the schema defines them, otherwise into `FieldsPerPage` chunks so a large
 * ungrouped module never overflows the component budget. Small modules collapse
 * to a single unnamed section (no switcher).
 */
function chunkSection(
  name: string | null,
  fields: ConfigField[],
): FieldSection[] {
  if (fields.length <= FieldsPerPage) return [{ name, fields }];
  return chunk(fields, FieldsPerPage).map((pageFields, idx) => ({
    name: name ? `${name} (${idx + 1})` : `Page ${idx + 1}`,
    fields: pageFields,
  }));
}

/**
 * Flattens the shared section/group split into the panel's one-level list.
 * Discord has a component budget the web doesn't, so `chunkSection` still
 * splits anything too long to fit on one card.
 */
function sectionsFor(fields: ConfigField[]): FieldSection[] {
  return sectionsOf(fields).flatMap((section) =>
    section.groups.flatMap((group) => {
      const named = group.name ?? (section.groups.length > 1 ? "General" : null);
      const label =
        [section.name, named].filter((part) => part).join(" · ") || null;
      return chunkSection(label, group.fields);
    }),
  );
}

/**
 * Module detail: every field renders as a status-glyph headline row with its
 * description below. BOOLEAN fields toggle in place, ENUM fields render as an
 * in-place string select with the current value preselected, picker fields
 * open a native-picker subpanel, and text-like fields open a modal directly.
 * Large modules split into named subsections navigated by a "jump to section"
 * select, so the card never scrolls into a wall of settings.
 *
 * @param sectionIndex - Which subsection to render; clamped to the section count.
 */
export function buildFeatureDetailView(
  meta: ModuleMeta,
  config: Record<string, unknown>,
  guildEnabled: boolean,
  sectionIndex = 0,
  t?: LumiT,
): CardReply {
  const fields = meta.configFields ?? [];
  const groups = sectionsFor(fields);
  const multi = groups.length > 1;
  const idx = Math.max(0, Math.min(sectionIndex, groups.length - 1));
  const current = groups[idx] ?? { name: null, fields: [] };

  const statusBadge = formatStatusBadge(
    guildEnabled ? "enabled" : "disabled",
    t,
  );

  const enumFields = current.fields.filter(isEnumField);
  const rowFields = current.fields.filter((field) => !isEnumField(field));

  const sections = rowFields.map((field) => {
    const lines = detailRowLines(field, config[field.key], t);

    if (field.type === FieldType.Boolean) {
      const fallback =
        field.default === undefined ? false : Boolean(field.default);
      const on = Boolean(config[field.key] ?? fallback);
      return settingRow(lines, {
        customId: `cfg:bool:${meta.name}:${field.key}:${idx}`,
        label: on ? Emojis.Check : Emojis.Cross,
        style: on ? ButtonStyle.Success : ButtonStyle.Secondary,
      });
    }

    if (isTextField(field)) {
      return settingRow(lines, {
        customId: `cfg:fedit:${meta.name}:${field.key}:${idx}`,
        label: t ? t(PanelsKeys.DetailEdit) : "Edit",
        emoji: Emojis.Edit,
        style: ButtonStyle.Secondary,
      });
    }

    return settingRow(lines, {
      customId: `cfg:field:${meta.name}:${field.key}:${idx}`,
      label: t ? t(PanelsKeys.DetailEdit) : "Edit",
      emoji: Emojis.Edit,
      style: ButtonStyle.Secondary,
    });
  });

  const rows: Row[] = enumFields.map((field) =>
    row(
      createStringSelectMenu({
        customId: `cfg:enum:${meta.name}:${field.key}:${idx}`,
        placeholder: cutText(field.label, 100),
        options: (field.choices ?? []).slice(0, MaxSelectOptions).map((choice) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cutText(choice, 100))
            .setValue(choice)
            .setDefault(choice === (config[field.key] ?? field.default)),
        ),
      }),
    ),
  );

  rows.push(
    row(
      createActionButton({
        customId: `cfg:tog:${meta.name}:${idx}`,
        label: guildEnabled
          ? t
            ? t(PanelsKeys.DetailDisable)
            : "Disable Module"
          : t
            ? t(PanelsKeys.DetailEnable)
            : "Enable Module",
        emoji: guildEnabled ? Emojis.Cross : Emojis.Check,
        style: guildEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: `cfg:rst:${meta.name}:${idx}`,
        label: t ? t(PanelsKeys.DetailReset) : "Reset",
        emoji: Emojis.Uninstall,
        style: ButtonStyle.Secondary,
      }),
    ),
  );

  if (multi) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `cfg:gsel:${meta.name}`,
          placeholder: t ? t(PanelsKeys.DetailJump) : "Jump to a section…",
          options: groups.slice(0, MaxSelectOptions).map((sec, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cutText(sec.name ?? "Settings", 100))
              .setValue(String(i))
              .setDescription(`${sec.fields.length} setting(s)`)
              .setDefault(i === idx),
          ),
        }),
      ),
    );
  }

  const secondaryComponents = [
    createBackButton(
      `cfg:back:0`,
      t ? t(PanelsKeys.BackToModules) : "← Back to Modules",
    ),
    createActionButton({
      customId: `cfg:hist:${meta.name}:${idx}`,
      label: t ? t(PanelsKeys.DetailHistory) : "History",
      emoji: Emojis.Clock,
      style: ButtonStyle.Secondary,
    }),
  ];

  if (meta.configOverrides) {
    secondaryComponents.push(
      createActionButton({
        customId: `cfg:ovr:${meta.name}:${idx}`,
        label: t ? t(PanelsKeys.DetailOverrides) : "Overrides",
        emoji: Emojis.Shield,
        style: ButtonStyle.Secondary,
      }),
    );
  }

  rows.push(row(...secondaryComponents));

  const body = [
    formatSubtitle(meta.description || "No description provided."),
    `**${t ? t(PanelsKeys.DetailStatus) : "Status"}:** ${statusBadge}`,
  ];
  if (multi && current.name) {
    body.push(
      t
        ? t(PanelsKeys.DetailSection, {
            name: current.name,
            index: idx + 1,
            total: groups.length,
          })
        : `Section **${current.name}** · ${idx + 1}/${groups.length}`,
    );
  }

  return noPingCard(
    makeCard(
      guildEnabled ? resolveCardColor("primary") : resolveCardColor("warning"),
      `${meta.emoji} ${meta.displayName}`,
      body,
      { breadcrumbs: ["Hub", "Modules", meta.displayName], sections, actionRows: buildSafeActionRows(rows) },
    ),
  );
}

const resolveChannelTypes = (f: ConfigField): ChannelType[] =>
  f.channelTypes?.length ? f.channelTypes : [ChannelType.GuildText];

/**
 * Per-field edit subpanel hosting the single native picker for the field, or
 * the modal entry button for text-like fields reached from stale messages.
 * Multi pickers allow up to {@linkcode MaxMultiValues} values with a zero
 * minimum so the selection can be cleared to unset the field.
 *
 * @param fieldPage - The detail subsection to return to, carried through the
 * picker's custom id so the back button lands on the right section.
 */
export function buildFieldEditView(
  meta: ModuleMeta,
  field: ConfigField,
  config: Record<string, unknown>,
  fieldPage = 0,
  t?: LumiT,
): CardReply {
  const rows: Row[] = [];

  if (
    field.type === FieldType.Channel ||
    field.type === FieldType.MultiChannel
  ) {
    const multi = field.type === FieldType.MultiChannel;
    rows.push(
      row(
        createChannelSelectMenu({
          customId: `cfg:ch:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          channelTypes: resolveChannelTypes(field),
          minValues: 0,
          maxValues: multi ? MaxMultiValues : 1,
        }),
      ),
    );
  } else if (
    field.type === FieldType.Role ||
    field.type === FieldType.MultiRole
  ) {
    const multi = field.type === FieldType.MultiRole;
    rows.push(
      row(
        createRoleSelectMenu({
          customId: `cfg:role:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          minValues: 0,
          maxValues: multi ? MaxMultiValues : 1,
        }),
      ),
    );
  } else if (
    field.type === FieldType.User ||
    field.type === FieldType.MultiUser
  ) {
    const multi = field.type === FieldType.MultiUser;
    rows.push(
      row(
        createUserSelectMenu({
          customId: `cfg:user:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          minValues: 0,
          maxValues: multi ? MaxMultiValues : 1,
        }),
      ),
    );
  } else if (field.type === FieldType.Enum && field.choices?.length) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `cfg:enum:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          options: field.choices.slice(0, MaxSelectOptions).map((choice) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cutText(choice, 100))
              .setValue(choice)
              .setDefault(choice === config[field.key]),
          ),
        }),
      ),
    );
  } else {
    rows.push(
      row(
        createActionButton({
          customId: `cfg:fedit:${meta.name}:${field.key}:${fieldPage}`,
          label: t ? t(PanelsKeys.FieldEditEnterValue) : "Enter value…",
          emoji: Emojis.Edit,
          style: ButtonStyle.Primary,
        }),
      ),
    );
  }

  rows.push(
    row(
      createBackButton(
        `cfg:open:${meta.name}:${fieldPage}`,
        t ? t(PanelsKeys.BackToFeature) : "← Back to Feature",
      ),
    ),
  );

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `${meta.emoji} ${
        t
          ? t(PanelsKeys.FieldEditTitle, {
              module: meta.displayName,
              field: field.label,
            })
          : `${meta.displayName} • ${field.label}`
      }`,
      [
        ...(field.description ? [formatSubtitle(field.description)] : []),
        `**${t ? t(PanelsKeys.FieldEditCurrent) : "Current value"}:** ${formatFieldValue(field, config[field.key])}`,
        `-# ${t ? t(PanelsKeys.FieldEditHint) : "Pick a new value below, or clear the selection to unset."}`,
      ],
      { breadcrumbs: ["Hub", "Modules", meta.displayName, field.label], actionRows: buildSafeActionRows(rows) },
    ),
  );
}
