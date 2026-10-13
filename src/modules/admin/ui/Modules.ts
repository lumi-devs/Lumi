import { chunk } from "#src/shared/Index.ts";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { resolveChannelTypeIds, sectionsOf } from "#src/contracts/Index.ts";
import { FieldType, type ConfigField } from "#src/lib/module-system/ConfigSchema.js";
import type { ModuleMeta } from "#src/lib/module-system/Meta.js";
import {
  formatFieldValue,
  formatPageFooter,
  formatSubtitle,
  row,
  type Row,
} from "#src/modules/onboarding/ui/Common.js";
import { hubTabRow } from "#src/modules/onboarding/ui/Hub.js";
import { resolveCardColor } from "#src/lib/ui/Palette.js";
import { makeCard, noPingCard, type CardReply } from "#src/lib/ui/Cards.js";
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
} from "#src/lib/ui/Panels.js";
import { StringSelectMenuOptionBuilder } from "@discordjs/builders";
import { cutText } from "#src/shared/Index.ts";
import { ButtonStyle, ChannelType } from "discord.js";
import { ConfigButtonId } from "#src/modules/core/Constants.js";

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
    ? `🟢 \`${t ? t("panels:detailEnabled") : "ENABLED"}\``
    : `🔴 \`${t ? t("panels:detailDisabled") : "DISABLED"}\``;

const hasStoredValue = (field: ConfigField, value: unknown): boolean => {
  const current = value ?? field.default ?? null;
  if (current === null || current === "") return false;
  if (Array.isArray(current)) return current.length > 0;
  return true;
};

const statusGlyphFor = (field: ConfigField, value: unknown): string => {
  if (field.type === FieldType.Boolean) {
    const fallback =
      field.default === undefined ? false : Boolean(field.default);
    const current = value ?? fallback;
    return current ? "✅" : "❌";
  }
  return hasStoredValue(field, value) ? "🟢" : "🔴";
};

const isEnumField = (field: ConfigField): boolean =>
  field.type === FieldType.Enum &&
  Array.isArray(field.choices) &&
  field.choices.length > 0;

const isTextField = (field: ConfigField): boolean =>
  field.type === FieldType.String ||
  field.type === FieldType.StringList ||
  field.type === FieldType.Number ||
  field.type === FieldType.Duration;

const detailRowLines = (
  field: ConfigField,
  value: unknown,
  t?: LumiT,
): string[] => {
  const required =
    field.required === true
      ? ` *${t ? t("panels:detailRequired") : "(required)"}*`
      : "";
  return [
    `${statusGlyphFor(field, value)} **${field.label}**${required} - ${formatFieldValue(field, value)}`,
    ...(field.description ? [`-# ${cutText(field.description, 90)}`] : []),
  ];
};

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
        `${f.guildEnabled ? "🟢" : "🔴"} ${f.meta.emoji} **${f.meta.displayName}**`,
        `-# ${f.meta.description ? cutText(f.meta.description, 90) : "No description"}`,
      ],
      {
        customId: ConfigButtonId.build({
          action: "open",
          moduleName: f.meta.name,
          rest: [String(safePage)],
        }),
        label: t ? t("panels:modulesOpen") : "Open",
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
    `⚙️ ${t ? t("panels:modulesTitle") : "Feature Modules"}`,
    pageFeatures.length
      ? ""
      : t
        ? t("panels:modulesEmpty")
        : "*No features registered.*",
    {
      breadcrumbs: ["Hub", "Modules"],
      sections,
      footer:
        totalPages > 1
          ? t
            ? t("panels:modulesPageFooter", {
                page: safePage + 1,
                total: totalPages,
              })
            : formatPageFooter(safePage, totalPages, "Open a module to enable, disable, or configure it.")
          : t
            ? t("panels:modulesFooter")
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
        customId: ConfigButtonId.build({
          action: "bool",
          moduleName: meta.name,
          rest: [field.key, String(idx)],
        }),
        label: on ? "✅" : "❌",
        style: on ? ButtonStyle.Success : ButtonStyle.Secondary,
      });
    }

    if (isTextField(field)) {
      return settingRow(lines, {
        customId: ConfigButtonId.build({
          action: "fedit",
          moduleName: meta.name,
          rest: [field.key, String(idx)],
        }),
        label: t ? t("panels:detailEdit") : "Edit",
        emoji: "✏️",
        style: ButtonStyle.Secondary,
      });
    }

    return settingRow(lines, {
      customId: ConfigButtonId.build({
        action: "field",
        moduleName: meta.name,
        rest: [field.key, String(idx)],
      }),
      label: t ? t("panels:detailEdit") : "Edit",
      emoji: "✏️",
      style: ButtonStyle.Secondary,
    });
  });

  const rows: Row[] = enumFields.map((field) =>
    row(
      createStringSelectMenu({
        customId: ConfigButtonId.build({
          action: "enum",
          moduleName: meta.name,
          rest: [field.key, String(idx)],
        }),
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
        customId: ConfigButtonId.build({
          action: "tog",
          moduleName: meta.name,
          rest: [String(idx)],
        }),
        label: guildEnabled
          ? t
            ? t("panels:detailDisable")
            : "Disable Module"
          : t
            ? t("panels:detailEnable")
            : "Enable Module",
        emoji: guildEnabled ? "❌" : "✅",
        style: guildEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: ConfigButtonId.build({
          action: "rst",
          moduleName: meta.name,
          rest: [String(idx)],
        }),
        label: t ? t("panels:detailReset") : "Reset",
        emoji: "🗑️",
        style: ButtonStyle.Secondary,
      }),
    ),
  );

  if (multi) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: ConfigButtonId.build({
            action: "gsel",
            moduleName: meta.name,
            rest: [],
          }),
          placeholder: t ? t("panels:detailJump") : "Jump to a section…",
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
      ConfigButtonId.build({ action: "back", moduleName: "0", rest: [] }),
      t ? t("panels:backToModules") : "← Back to Modules",
    ),
    createActionButton({
      customId: ConfigButtonId.build({
        action: "hist",
        moduleName: meta.name,
        rest: [String(idx)],
      }),
      label: t ? t("panels:detailHistory") : "History",
      emoji: "🕐",
      style: ButtonStyle.Secondary,
    }),
  ];

  if (meta.configOverrides) {
    secondaryComponents.push(
      createActionButton({
        customId: ConfigButtonId.build({
          action: "ovr",
          moduleName: meta.name,
          rest: [String(idx)],
        }),
        label: t ? t("panels:detailOverrides") : "Overrides",
        emoji: "🛡️",
        style: ButtonStyle.Secondary,
      }),
    );
  }

  rows.push(row(...secondaryComponents));

  const body = [
    formatSubtitle(meta.description || "No description provided."),
    `**${t ? t("panels:detailStatus") : "Status"}:** ${statusBadge}`,
  ];
  if (multi && current.name) {
    body.push(
      t
        ? t("panels:detailSection", {
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
  resolveChannelTypeIds(f) as ChannelType[];

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
          customId: ConfigButtonId.build({
            action: "ch",
            moduleName: meta.name,
            rest: [field.key, String(fieldPage)],
          }),
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
          customId: ConfigButtonId.build({
            action: "role",
            moduleName: meta.name,
            rest: [field.key, String(fieldPage)],
          }),
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
          customId: ConfigButtonId.build({
            action: "user",
            moduleName: meta.name,
            rest: [field.key, String(fieldPage)],
          }),
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
          customId: ConfigButtonId.build({
            action: "enum",
            moduleName: meta.name,
            rest: [field.key, String(fieldPage)],
          }),
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
          customId: ConfigButtonId.build({
            action: "fedit",
            moduleName: meta.name,
            rest: [field.key, String(fieldPage)],
          }),
          label: t ? t("panels:fieldEditEnterValue") : "Enter value…",
          emoji: "✏️",
          style: ButtonStyle.Primary,
        }),
      ),
    );
  }

  rows.push(
    row(
      createBackButton(
        ConfigButtonId.build({
          action: "open",
          moduleName: meta.name,
          rest: [String(fieldPage)],
        }),
        t ? t("panels:backToFeature") : "← Back to Feature",
      ),
    ),
  );

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `${meta.emoji} ${
        t
          ? t("panels:fieldEditTitle", {
              module: meta.displayName,
              field: field.label,
            })
          : `${meta.displayName} • ${field.label}`
      }`,
      [
        ...(field.description ? [formatSubtitle(field.description)] : []),
        `**${t ? t("panels:fieldEditCurrent") : "Current value"}:** ${formatFieldValue(field, config[field.key])}`,
        `-# ${t ? t("panels:fieldEditHint") : "Pick a new value below, or clear the selection to unset."}`,
      ],
      { breadcrumbs: ["Hub", "Modules", meta.displayName, field.label], actionRows: buildSafeActionRows(rows) },
    ),
  );
}
