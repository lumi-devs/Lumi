import {
  ActionRowBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  ChannelType,
  GuildMember,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { container } from "@sapphire/framework";
import {
  PermissionLevel,
  resolvePermissionLevel,
} from "#lib/permissions/index.js";
import {
  channelMention,
  roleMention,
  userMention,
  time,
  TimestampStyles,
} from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import {
  FieldType,
  type ConfigField,
  type ModuleMeta,
} from "#lib/module-system/Module.js";
import {
  makeCard,
  noPingCard,
  CARD_ACCENTS,
  type CardReply,
} from "#utilities/cards.js";

import { hubTabRow } from "#modules/core/lib/hub-panel.js";
import { Emojis } from "#utilities/assets.js";
import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import {
  createActionButton,
  createBackButton,
  createChannelSelectMenu,
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  buildSafeActionRows,
  settingRow,
} from "#utilities/panels.js";

const formatSubtitle = (text: string) => `-# ${text}`;
const formatStatusBadge = (status: "enabled" | "disabled", t?: LumiT) =>
  status === "enabled"
    ? `${Emojis.SUCCESS} \`${t ? t(PanelsKeys.DetailEnabled) : "ENABLED"}\``
    : `${Emojis.ERROR} \`${t ? t(PanelsKeys.DetailDisabled) : "DISABLED"}\``;
import type {
  ConfigHistoryEntry,
  ConfigOverrideEntry,
} from "#lib/prisma/DatabaseService.js";

export const FEATURES_PER_PAGE = 8;
export const FIELDS_PER_PAGE = 6;

export interface FeatureDetail {
  meta: ModuleMeta;
  config: Record<string, unknown>;
  guildEnabled: boolean;
}

export async function loadFeatures(
  guildId: string,
): Promise<FeatureListEntry[]> {
  return Promise.all(
    container.moduleStore.all().map(async (record) => ({
      meta: record.meta,
      guildEnabled: await container.db.modules.isModuleGuildEnabled(
        guildId,
        record.meta.name,
      ),
    })),
  );
}

export async function loadDetail(
  guildId: string,
  moduleName: string,
): Promise<FeatureDetail | null> {
  const record = container.moduleStore.getRecord(moduleName);
  if (!record) return null;
  const [config, guildEnabled] = await Promise.all([
    container.db.config.getAllModuleConfig(guildId, moduleName),
    container.db.modules.isModuleGuildEnabled(guildId, moduleName),
  ]);
  return { meta: record.meta, config, guildEnabled };
}

/** Re-checks that the interacting user still has ADMIN in this guild. */
export async function hasPanelAccess(
  interaction:
    ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction,
): Promise<boolean> {
  if (!interaction.guild || !interaction.member) return false;
  const member =
    interaction.member instanceof GuildMember ? interaction.member : null;
  const level = await resolvePermissionLevel({
    userId: interaction.user.id,
    guild: interaction.guild,
    member,
  });
  return level >= PermissionLevel.ADMIN;
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

export function formatFieldValue(field: ConfigField, value: unknown): string {
  const val = value ?? field.default ?? null;
  if (val === null || val === "") return "-# *(not set)*";

  if (
    field.list ||
    (field.type === FieldType.STRING &&
      typeof val === "string" &&
      /^\d{17,20}(?:,\s*\d{17,20})*$/.test(val))
  ) {
    const ids =
      typeof val === "string"
        ? val
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : Array.isArray(val)
          ? val
          : [];
    if (ids.length > 0) {
      if (field.key.includes("role")) {
        return ids.map((id) => roleMention(id)).join(", ");
      }
      if (field.key.includes("channel")) {
        return ids.map((id) => channelMention(id)).join(", ");
      }
      if (field.key.includes("user")) {
        return ids.map((id) => userMention(id)).join(", ");
      }
    }
  }

  switch (field.type) {
    case FieldType.CHANNEL:
      return channelMention(String(val));
    case FieldType.ROLE:
      return roleMention(String(val));
    case FieldType.USER:
      return userMention(String(val));
    case FieldType.BOOLEAN:
      return val ? `${Emojis.CHECK} Yes` : `${Emojis.CROSS} No`;
    default:
      return `\`${cutText(String(val), 120)}\``;
  }
}

export interface FeatureListEntry {
  meta: ModuleMeta;
  guildEnabled: boolean;
}

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
    CARD_ACCENTS.PRIMARY,
    `${Emojis.GEAR} ${t ? t(PanelsKeys.ModulesTitle) : "Feature Modules"}`,
    [
      formatSubtitle(
        t
          ? t(PanelsKeys.ModulesSubtitle)
          : "Browse and configure feature modules enabled for this server.",
      ),
      pageFeatures.length
        ? ""
        : (t ? t(PanelsKeys.ModulesEmpty) : "*No features registered.*"),
    ],
    {
      sections,
      footer:
        totalPages > 1
          ? t
            ? t(PanelsKeys.ModulesPageFooter, {
                page: safePage + 1,
                total: totalPages,
              })
            : `Page ${safePage + 1}/${totalPages} • Open a module to enable, disable, or configure it.`
          : t
            ? t(PanelsKeys.ModulesFooter)
            : "Open a module to enable, disable, or configure it.",
      actionRows: buildSafeActionRows(rows),
    },
  );
}

/**
 * Module detail: fields render as section rows with inline accessory buttons
 * (booleans toggle in place, everything else opens a per-field edit subpanel),
 * paginated so the card never exceeds Discord's component budget.
 */
export function buildFeatureDetailView(
  meta: ModuleMeta,
  config: Record<string, unknown>,
  guildEnabled: boolean,
  fieldPage = 0,
  t?: LumiT,
): CardReply {
  const fields = meta.configFields ?? [];
  const totalPages = Math.max(1, Math.ceil(fields.length / FIELDS_PER_PAGE));
  const safePage = Math.max(0, Math.min(fieldPage, totalPages - 1));
  const pageFields = fields.slice(
    safePage * FIELDS_PER_PAGE,
    (safePage + 1) * FIELDS_PER_PAGE,
  );

  const statusBadge = formatStatusBadge(
    guildEnabled ? "enabled" : "disabled",
    t,
  );

  const sections = pageFields.map((f) => {
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
        customId: `cfg:bool:${meta.name}:${f.key}:${safePage}`,
        label: on ? Emojis.CHECK : Emojis.CROSS,
        style: on ? ButtonStyle.Success : ButtonStyle.Secondary,
      });
    }

    return settingRow(lines, {
      customId: `cfg:field:${meta.name}:${f.key}:${safePage}`,
      label: t ? t(PanelsKeys.DetailEdit) : "Edit",
      emoji: Emojis.EDIT,
      style: ButtonStyle.Secondary,
    });
  });

  const rows: Row[] = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      createActionButton({
        customId: `cfg:tog:${meta.name}:${safePage}`,
        label: guildEnabled
          ? (t ? t(PanelsKeys.DetailDisable) : "Disable Module")
          : (t ? t(PanelsKeys.DetailEnable) : "Enable Module"),
        emoji: guildEnabled ? Emojis.CROSS : Emojis.CHECK,
        style: guildEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: `cfg:rst:${meta.name}:${safePage}`,
        label: t ? t(PanelsKeys.DetailReset) : "Reset",
        emoji: Emojis.UNINSTALL,
        style: ButtonStyle.Secondary,
      }),
    ),
  ];

  const secondaryComponents: MessageActionRowComponentBuilder[] = [
    createBackButton(
      `cfg:back:${safePage}`,
      t ? t(PanelsKeys.BackToModules) : "← Back to Modules",
    ),
    createActionButton({
      customId: `cfg:hist:${meta.name}:${safePage}`,
      label: t ? t(PanelsKeys.DetailHistory) : "History",
      emoji: Emojis.CLOCK,
      style: ButtonStyle.Secondary,
    }),
  ];

  if (meta.configOverrides) {
    secondaryComponents.push(
      createActionButton({
        customId: `cfg:ovr:${meta.name}:${safePage}`,
        label: t ? t(PanelsKeys.DetailOverrides) : "Overrides",
        emoji: Emojis.SHIELD,
        style: ButtonStyle.Secondary,
      }),
    );
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...secondaryComponents,
    ),
  );

  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: `cfg:fpage:${meta.name}`,
        currentPage: safePage,
        totalPages,
      }),
    );
  }

  const footer =
    totalPages > 1
      ? t
        ? t(PanelsKeys.DetailFieldsFooter, {
            from: safePage * FIELDS_PER_PAGE + 1,
            to: safePage * FIELDS_PER_PAGE + pageFields.length,
            count: fields.length,
          })
        : `Fields ${safePage * FIELDS_PER_PAGE + 1}-${safePage * FIELDS_PER_PAGE + pageFields.length} of ${fields.length}`
      : undefined;

  return noPingCard(
    makeCard(
      guildEnabled ? CARD_ACCENTS.PRIMARY : CARD_ACCENTS.WARNING,
      `${meta.emoji} ${meta.displayName}`,
      [
        formatSubtitle(meta.description || "No description provided."),
        `**${t ? t(PanelsKeys.DetailStatus) : "Status"}:** ${statusBadge}`,
      ],
      { sections, footer, actionRows: buildSafeActionRows(rows) },
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

/** Per-field edit subpanel hosting the single native picker for the field. */
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
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      createBackButton(
        `cfg:open:${meta.name}:${fieldPage}`,
        t ? t(PanelsKeys.BackToFeature) : "← Back to Feature",
      ),
    ),
  );

  return noPingCard(
    makeCard(
      CARD_ACCENTS.PRIMARY,
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
      { actionRows: buildSafeActionRows(rows) },
    ),
  );
}

export function buildHistoryView(
  meta: ModuleMeta,
  entries: ConfigHistoryEntry[],
  page = 0,
): CardReply {
  const fieldByKey = new Map(
    (meta.configFields ?? []).map((f) => [f.key, f] as const),
  );
  const labelFor = (key: string) => fieldByKey.get(key)?.label ?? key;
  const fmt = (key: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "*unset*";
    const field = fieldByKey.get(key);
    if (field) return formatFieldValue(field, v);
    return typeof v === "object"
      ? `\`${cutText(JSON.stringify(v), 60)}\``
      : `\`${cutText(String(v), 60)}\``;
  };

  const lines = entries.length
    ? entries.map(
        (e) =>
          `**${labelFor(e.key)}** - ${fmt(e.key, e.oldValue)} → ${fmt(e.key, e.newValue)}\n-# by ${userMention(e.actorId)} • ${time(e.createdAt, TimestampStyles.RelativeTime)}`,
      )
    : ["*No changes recorded yet.*"];

  const rows: Row[] = [];
  const rollbackable = entries.filter(
    (e) => e.oldValue !== null && e.oldValue !== undefined,
  );

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      createBackButton(`cfg:open:${meta.name}:${page}`, "← Back to Feature"),
    ),
  );

  if (rollbackable.length) {
    const rbSelect = createStringSelectMenu({
      customId: `cfg:rb:${meta.name}:${page}`,
      placeholder: "Roll back a change…",
      options: rollbackable.slice(0, 25).map((e) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cutText(`Restore ${labelFor(e.key)}`, 100))
          .setValue(e.id)
          .setDescription(
            cutText(`Roll back to its previous value`, 100),
          ),
      ),
    });
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(rbSelect),
    );
  }

  return noPingCard(
    makeCard(
      CARD_ACCENTS.INFO,
      `${Emojis.CLOCK} ${meta.displayName} • History`,
      [
        formatSubtitle("Configuration change log and rollback history."),
        lines.join("\n"),
      ],
      { actionRows: buildSafeActionRows(rows) },
    ),
  );
}

const overrideTargetMention = (o: ConfigOverrideEntry) => {
  switch (o.modelType) {
    case "channel":
    case "category":
      return channelMention(o.modelId);
    case "role":
      return roleMention(o.modelId);
    case "user":
      return userMention(o.modelId);
    default:
      return `\`${o.modelId}\``;
  }
};

export function buildOverridesView(
  meta: ModuleMeta,
  overrides: ConfigOverrideEntry[],
  page = 0,
): CardReply {
  const lines = overrides.length
    ? overrides.map(
        (o) =>
          `\`${o.key}\` - ${o.modelType} ${overrideTargetMention(o)} → \`${cutText(String(o.value), 60)}\``,
      )
    : ["*No overrides set for this feature.*"];

  const rows: Row[] = [];

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      createBackButton(`cfg:open:${meta.name}:${page}`, "← Back to Feature"),
      createActionButton({
        customId: `cfg:ovadd:${meta.name}:${page}`,
        label: "Add Override…",
        emoji: Emojis.EDIT,
        style: ButtonStyle.Primary,
      }),
    ),
  );

  if (overrides.length) {
    const rmSelect = createStringSelectMenu({
      customId: `cfg:ovrm:${meta.name}:${page}`,
      placeholder: "Remove an override…",
      options: overrides.slice(0, 25).map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cutText(`${o.key} • ${o.modelType}`, 100))
          .setValue(`${o.modelType}|${o.modelId}|${o.key}`)
          .setDescription(cutText(String(o.value), 100)),
      ),
    });
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(rmSelect),
    );
  }

  return noPingCard(
    makeCard(
      CARD_ACCENTS.PURPLE,
      `${Emojis.SHIELD} ${meta.displayName} • Overrides`,
      [
        formatSubtitle("Targeted configuration overrides for channels, roles, and users."),
        lines.join("\n"),
        "-# Overrides apply a config value for a specific channel, role, user, or category.",
      ],
      { actionRows: buildSafeActionRows(rows) },
    ),
  );
}

/**
 * Interactive target & field selection view for creating module overrides.
 * Replaces manual text ID input modals with native Discord entity select menus.
 */
export function buildAddOverrideTargetView(
  meta: ModuleMeta,
  page = 0,
): CardReply {
  const fields = meta.configFields ?? [];
  const keyMenu = createStringSelectMenu({
    customId: `cfg:ov:pick_key:${meta.name}:${page}`,
    placeholder: "Select Config Key to Override…",
    options: fields.length
      ? fields.slice(0, 25).map((f) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cutText(f.label, 100))
            .setValue(f.key)
            .setDescription(cutText(`Key: ${f.key}`, 100)),
        )
      : [
          new StringSelectMenuOptionBuilder()
            .setLabel("No configurable keys")
            .setValue("_none"),
        ],
  });

  const roleMenu = createRoleSelectMenu({
    customId: `cfg:ov:pick_role:${meta.name}:${page}`,
    placeholder: "Select Target Role for Override…",
  });

  const channelMenu = createChannelSelectMenu({
    customId: `cfg:ov:pick_channel:${meta.name}:${page}`,
    placeholder: "Select Target Channel for Override…",
  });

  const userMenu = createUserSelectMenu({
    customId: `cfg:ov:pick_user:${meta.name}:${page}`,
    placeholder: "Select Target User for Override…",
  });

  const backRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    createBackButton(`cfg:ovr:${meta.name}:${page}`, "← Back to Overrides"),
  );

  return makeCard(
    CARD_ACCENTS.PURPLE,
    `${Emojis.SHIELD} Add Override • ${meta.displayName}`,
    [
      formatSubtitle("Select target role, channel, or user via select menus."),
      "Pick a target entity below to apply a custom config override.",
    ],
    {
      actionRows: buildSafeActionRows([
        backRow,
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(keyMenu),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(roleMenu),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(channelMenu),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(userMenu),
      ]),
    },
  );
}
