import { chunk } from "@sapphire/utilities";
import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
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
// components once nested, and card chrome (container/title/footer/tab row)
// already eats ~18-19 of Discord's 40-component budget per message.
export const FEATURES_PER_PAGE = 4;
export const FIELDS_PER_PAGE = 5;

export interface FeatureListEntry {
  meta: ModuleMeta;
  guildEnabled: boolean;
}

const formatStatusBadge = (status: "enabled" | "disabled", t?: LumiT) =>
  status === "enabled"
    ? `${Emojis.SUCCESS} \`${t ? t(PanelsKeys.DetailEnabled) : "ENABLED"}\``
    : `${Emojis.ERROR} \`${t ? t(PanelsKeys.DetailDisabled) : "DISABLED"}\``;

/**
 * The modules tab: one row per guild-toggleable module, sorted by display name
 * and paginated at {@linkcode FEATURES_PER_PAGE}.
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
  const totalPages = Math.max(1, Math.ceil(sorted.length / FEATURES_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * FEATURES_PER_PAGE;
  const pageFeatures = sorted.slice(start, start + FEATURES_PER_PAGE);

  const sections = pageFeatures.map((f) =>
    settingRow(
      [
        `${f.guildEnabled ? Emojis.SUCCESS : Emojis.ERROR} ${f.meta.emoji} **${f.meta.displayName}**`,
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
    `${Emojis.GEAR} ${t ? t(PanelsKeys.ModulesTitle) : "Feature Modules"}`,
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
 * the schema defines them, otherwise into `FIELDS_PER_PAGE` chunks so a large
 * ungrouped module never overflows the component budget. Small modules collapse
 * to a single unnamed section (no switcher).
 */
function chunkSection(
  name: string | null,
  fields: ConfigField[],
): FieldSection[] {
  if (fields.length <= FIELDS_PER_PAGE) return [{ name, fields }];
  return chunk(fields, FIELDS_PER_PAGE).map((pageFields, idx) => ({
    name: name ? `${name} (${idx + 1})` : `Page ${idx + 1}`,
    fields: pageFields,
  }));
}

function sectionsFor(fields: ConfigField[]): FieldSection[] {
  if (fields.some((f) => f.group)) {
    const order: string[] = [];
    const map = new Map<string, ConfigField[]>();
    for (const f of fields) {
      const g = f.group ?? "General";
      let arr = map.get(g);
      if (!arr) {
        arr = [];
        map.set(g, arr);
        order.push(g);
      }
      arr.push(f);
    }
    return order.flatMap((name) => chunkSection(name, map.get(name)!));
  }
  return chunkSection(null, fields);
}

/**
 * Module detail: fields render as section rows with inline accessory buttons
 * (booleans toggle in place, everything else opens a per-field edit subpanel).
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

  const sections = current.fields.map((f) => {
    const req = f.required
      ? ` *${t ? t(PanelsKeys.DetailRequired) : "(required)"}*`
      : "";
    const lines = [
      `**${f.label}**${req} - ${formatFieldValue(f, config[f.key])}`,
      ...(f.description ? [`-# ${cutText(f.description, 90)}`] : []),
    ];

    if (f.type === FieldType.BOOLEAN) {
      const def = f.default === undefined ? false : Boolean(f.default);
      const on = Boolean(config[f.key] ?? def);
      return settingRow(lines, {
        customId: `cfg:bool:${meta.name}:${f.key}:${idx}`,
        label: on ? Emojis.CHECK : Emojis.CROSS,
        style: on ? ButtonStyle.Success : ButtonStyle.Secondary,
      });
    }

    return settingRow(lines, {
      customId: `cfg:field:${meta.name}:${f.key}:${idx}`,
      label: t ? t(PanelsKeys.DetailEdit) : "Edit",
      emoji: Emojis.EDIT,
      style: ButtonStyle.Secondary,
    });
  });

  const rows: Row[] = [
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
        emoji: guildEnabled ? Emojis.CROSS : Emojis.CHECK,
        style: guildEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: `cfg:rst:${meta.name}:${idx}`,
        label: t ? t(PanelsKeys.DetailReset) : "Reset",
        emoji: Emojis.UNINSTALL,
        style: ButtonStyle.Secondary,
      }),
    ),
  ];

  if (multi) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `cfg:gsel:${meta.name}`,
          placeholder: t ? t(PanelsKeys.DetailJump) : "Jump to a section…",
          options: groups.slice(0, 25).map((sec, i) =>
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
      emoji: Emojis.CLOCK,
      style: ButtonStyle.Secondary,
    }),
  ];

  if (meta.configOverrides) {
    secondaryComponents.push(
      createActionButton({
        customId: `cfg:ovr:${meta.name}:${idx}`,
        label: t ? t(PanelsKeys.DetailOverrides) : "Overrides",
        emoji: Emojis.SHIELD,
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

const resolveChannelTypes = (f: ConfigField): ChannelType[] => {
  if (f.channelTypes?.length) return f.channelTypes;
  if (
    f.key.includes("base") ||
    f.key.includes("voice") ||
    f.key.includes("lounge")
  ) {
    return [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
  }
  return [ChannelType.GuildText];
};

/**
 * Per-field edit subpanel hosting the single native picker for the field.
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
  const isRoleList = field.list && field.key.includes("role");
  const isChannelList = field.list && field.key.includes("channel");
  const isUserList = field.list && field.key.includes("user");

  const rows: Row[] = [];

  if (field.type === FieldType.CHANNEL || isChannelList) {
    rows.push(
      row(
        createChannelSelectMenu({
          customId: `cfg:ch:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          channelTypes: resolveChannelTypes(field),
          minValues: 0,
          maxValues: isChannelList ? 25 : 1,
        }),
      ),
    );
  } else if (field.type === FieldType.ROLE || isRoleList) {
    rows.push(
      row(
        createRoleSelectMenu({
          customId: `cfg:role:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          minValues: 0,
          maxValues: isRoleList ? 25 : 1,
        }),
      ),
    );
  } else if (field.type === FieldType.USER || isUserList) {
    rows.push(
      row(
        createUserSelectMenu({
          customId: `cfg:user:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          minValues: 0,
          maxValues: isUserList ? 25 : 1,
        }),
      ),
    );
  } else if (field.type === FieldType.ENUM && field.choices?.length) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `cfg:enum:${meta.name}:${field.key}:${fieldPage}`,
          placeholder: cutText(field.label, 100),
          options: field.choices.slice(0, 25).map((choice) =>
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
          emoji: Emojis.EDIT,
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
