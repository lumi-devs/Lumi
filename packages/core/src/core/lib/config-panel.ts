import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle, ChannelType } from "discord.js";
import { container } from "@sapphire/framework";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import type {
  ButtonInteraction,
  AnySelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";
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
} from "#core/module-system/Module.js";
import { makeCard, noPingCard, type CardReply } from "#utilities/cards.js";
import { EmberColors } from "#utilities/branding.js";
import { EmberEmojis } from "#utilities/assets.js";
import type {
  ConfigHistoryEntry,
  ConfigOverrideEntry,
} from "#root/prisma/DatabaseService.js";

export const FEATURES_PER_PAGE = 25;

// ── Data loading + access ──────────────────────────────────────────────────

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
    | ButtonInteraction
    | AnySelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<boolean> {
  if (!interaction.guild || !interaction.member) return false;
  const level = await resolvePermissionLevel({
    userId: interaction.user.id,
    guild: interaction.guild,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GuildMember shape satisfies PermissionContext.member at runtime
    member: interaction.member as any,
  });
  return level >= PermissionLevel.ADMIN;
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const row = (...components: MessageActionRowComponentBuilder[]): Row =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

// ── Value formatting ──────────────────────────────────────────────────────

export function formatFieldValue(field: ConfigField, value: unknown): string {
  const val = value ?? field.default ?? null;
  if (val === null || val === undefined || val === "") return "-# *(not set)*";
  switch (field.type) {
    case FieldType.CHANNEL:
      return channelMention(String(val));
    case FieldType.ROLE:
      return roleMention(String(val));
    case FieldType.USER:
      return userMention(String(val));
    case FieldType.BOOLEAN:
      return val ? `${EmberEmojis.CHECK} Yes` : `${EmberEmojis.CROSS} No`;
    default:
      return `\`${cutText(String(val), 120)}\``;
  }
}

const hasFieldType = (meta: ModuleMeta, ...types: FieldType[]) =>
  (meta.configFields ?? []).some((f) => types.includes(f.type));

// ── Feature list view ─────────────────────────────────────────────────────

export interface FeatureListEntry {
  meta: ModuleMeta;
  guildEnabled: boolean;
}

export function buildFeatureListView(
  features: FeatureListEntry[],
  page = 0,
): CardReply {
  const sorted = [...features].sort((a, b) =>
    a.meta.displayName.localeCompare(b.meta.displayName),
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / FEATURES_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * FEATURES_PER_PAGE;
  const pageFeatures = sorted.slice(start, start + FEATURES_PER_PAGE);

  const lines = pageFeatures.map((f) => {
    const dot = f.guildEnabled ? EmberEmojis.SUCCESS : EmberEmojis.ERROR;
    return `${dot} ${f.meta.emoji} **${f.meta.displayName}**`;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("cfg:sel")
    .setPlaceholder("Select a feature to configure…")
    .addOptions(
      pageFeatures.length
        ? pageFeatures.map((f) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cutText(f.meta.displayName, 100))
              .setValue(f.meta.name)
              .setDescription(
                f.meta.description
                  ? cutText(f.meta.description, 100)
                  : "No description",
              )
              .setEmoji(EmberEmojis.parse(f.meta.emoji)),
          )
        : [
            new StringSelectMenuOptionBuilder()
              .setLabel("No features registered")
              .setValue("_none"),
          ],
    )
    .setDisabled(pageFeatures.length === 0);

  const rows: Row[] = [row(select)];

  if (totalPages > 1) {
    rows.push(
      row(
        new ButtonBuilder()
          .setCustomId(`cfg:page:${safePage - 1}`)
          .setLabel("Prev")
          .setEmoji(EmberEmojis.parse(EmberEmojis.ARROW_LEFT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(`cfg:page:${safePage + 1}`)
          .setLabel("Next")
          .setEmoji(EmberEmojis.parse(EmberEmojis.ARROW_RIGHT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
      ),
    );
  }

  return makeCard(
    EmberColors.PRIMARY,
    `${EmberEmojis.GEAR} Server Config`,
    lines.length ? lines.join("\n") : "*No features registered.*",
    {
      footer:
        totalPages > 1
          ? `Page ${safePage + 1}/${totalPages} • Select a feature below to enable, disable, or configure it.`
          : "Select a feature below to enable, disable, or configure it.",
      actionRows: rows,
    },
  );
}

// ── Feature detail view ───────────────────────────────────────────────────

export function buildFeatureDetailView(
  meta: ModuleMeta,
  config: Record<string, unknown>,
  guildEnabled: boolean,
): CardReply {
  const fields = meta.configFields ?? [];
  const statusLine = guildEnabled
    ? `${EmberEmojis.SUCCESS} **Enabled**`
    : `${EmberEmojis.ERROR} **Disabled**`;

  const fieldLines = [`**Status:** ${statusLine}`];
  for (const f of fields) {
    const req = f.required ? " *(required)*" : "";
    fieldLines.push(
      `**${f.label}:** ${formatFieldValue(f, config[f.key])}${req}`,
    );
  }

  const rows: Row[] = [];

  // Primary actions
  const primary = [
    new ButtonBuilder()
      .setCustomId(`cfg:tog:${meta.name}`)
      .setLabel(guildEnabled ? "Disable" : "Enable")
      .setStyle(guildEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
  ];
  if (hasFieldType(meta, FieldType.STRING, FieldType.NUMBER)) {
    primary.push(
      new ButtonBuilder()
        .setCustomId(`cfg:cfg:${meta.name}`)
        .setLabel("Configure…")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  primary.push(
    new ButtonBuilder()
      .setCustomId(`cfg:rst:${meta.name}`)
      .setLabel("Reset")
      .setEmoji(EmberEmojis.parse(EmberEmojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(row(...primary));

  // Secondary actions
  const secondary = [
    new ButtonBuilder()
      .setCustomId(`cfg:hist:${meta.name}`)
      .setLabel("History")
      .setEmoji(EmberEmojis.parse(EmberEmojis.CLOCK))
      .setStyle(ButtonStyle.Secondary),
  ];
  if (meta.configOverrides) {
    secondary.push(
      new ButtonBuilder()
        .setCustomId(`cfg:ovr:${meta.name}`)
        .setLabel("Overrides")
        .setEmoji(EmberEmojis.parse(EmberEmojis.SHIELD))
        .setStyle(ButtonStyle.Secondary),
    );
  }
  secondary.push(
    new ButtonBuilder()
      .setCustomId("cfg:back")
      .setLabel("Back")
      .setEmoji(EmberEmojis.parse(EmberEmojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(row(...secondary));

  // Boolean toggles (up to 5 per row)
  const boolFields = fields.filter((f) => f.type === FieldType.BOOLEAN);
  for (let i = 0; i < boolFields.length; i += 5) {
    const chunk = boolFields.slice(i, i + 5);
    rows.push(
      row(
        ...chunk.map((f) => {
          const def = f.default === undefined ? false : Boolean(f.default);
          const on = Boolean(config[f.key] ?? def);
          return new ButtonBuilder()
            .setCustomId(`cfg:bool:${meta.name}:${f.key}`)
            .setLabel(
              `${on ? EmberEmojis.CHECK : EmberEmojis.CROSS} ${cutText(f.label, 60)}`,
            )
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary);
        }),
      ),
    );
  }

  // Select-based fields (one row each)
  for (const f of fields) {
    if (f.type === FieldType.CHANNEL) {
      const chBuilder = new ChannelSelectMenuBuilder()
        .setCustomId(`cfg:ch:${meta.name}:${f.key}`)
        .setPlaceholder(`Set: ${cutText(f.label, 80)}`)
        .setMinValues(0)
        .setMaxValues(1);
      if (f.channelTypes?.length) {
        chBuilder.setChannelTypes(...f.channelTypes);
      } else {
        chBuilder.setChannelTypes(ChannelType.GuildText);
      }
      rows.push(row(chBuilder));
    } else if (f.type === FieldType.ROLE) {
      rows.push(
        row(
          new RoleSelectMenuBuilder()
            .setCustomId(`cfg:role:${meta.name}:${f.key}`)
            .setPlaceholder(`Set: ${cutText(f.label, 80)}`)
            .setMinValues(0)
            .setMaxValues(1),
        ),
      );
    } else if (f.type === FieldType.USER) {
      rows.push(
        row(
          new UserSelectMenuBuilder()
            .setCustomId(`cfg:user:${meta.name}:${f.key}`)
            .setPlaceholder(`Set: ${cutText(f.label, 80)}`)
            .setMinValues(0)
            .setMaxValues(1),
        ),
      );
    } else if (f.type === FieldType.ENUM && f.choices?.length) {
      const current = config[f.key];
      rows.push(
        row(
          new StringSelectMenuBuilder()
            .setCustomId(`cfg:enum:${meta.name}:${f.key}`)
            .setPlaceholder(`Set: ${cutText(f.label, 80)}`)
            .addOptions(
              f.choices.slice(0, 25).map((choice) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(cutText(choice, 100))
                  .setValue(choice)
                  .setDefault(choice === current),
              ),
            ),
        ),
      );
    }
  }

  return noPingCard(
    makeCard(
      guildEnabled ? EmberColors.SUCCESS : EmberColors.ERROR,
      `${meta.emoji} ${meta.displayName}`,
      [meta.description || "No description.", fieldLines.join("\n")],
      { actionRows: rows },
    ),
  );
}

// ── History view ──────────────────────────────────────────────────────────

export function buildHistoryView(
  meta: ModuleMeta,
  entries: ConfigHistoryEntry[],
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
          `**${labelFor(e.key)}** — ${fmt(e.key, e.oldValue)} → ${fmt(e.key, e.newValue)}\n-# by ${userMention(e.actorId)} • ${time(e.createdAt, TimestampStyles.RelativeTime)}`,
      )
    : ["*No changes recorded yet.*"];

  const rows: Row[] = [];
  const rollbackable = entries.filter(
    (e) => e.oldValue !== null && e.oldValue !== undefined,
  );
  if (rollbackable.length) {
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`cfg:rb:${meta.name}`)
          .setPlaceholder("Roll back a change…")
          .addOptions(
            rollbackable.slice(0, 25).map((e) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(cutText(`Restore ${labelFor(e.key)}`, 100))
                .setValue(e.id)
                .setDescription(
                  cutText(`Roll back to its previous value`, 100),
                ),
            ),
          ),
      ),
    );
  }
  rows.push(
    row(
      new ButtonBuilder()
        .setCustomId(`cfg:open:${meta.name}`)
        .setLabel("Back")
        .setEmoji(EmberEmojis.parse(EmberEmojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return noPingCard(
    makeCard(
      EmberColors.PRIMARY,
      `${EmberEmojis.CLOCK} ${meta.displayName} • History`,
      lines.join("\n"),
      { actionRows: rows },
    ),
  );
}

// ── Overrides view ────────────────────────────────────────────────────────

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
): CardReply {
  const lines = overrides.length
    ? overrides.map(
        (o) =>
          `\`${o.key}\` — ${o.modelType} ${overrideTargetMention(o)} → \`${cutText(String(o.value), 60)}\``,
      )
    : ["*No overrides set for this feature.*"];

  const rows: Row[] = [];
  if (overrides.length) {
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`cfg:ovrm:${meta.name}`)
          .setPlaceholder("Remove an override…")
          .addOptions(
            overrides.slice(0, 25).map((o) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(cutText(`${o.key} • ${o.modelType}`, 100))
                .setValue(`${o.modelType}|${o.modelId}|${o.key}`)
                .setDescription(cutText(String(o.value), 100)),
            ),
          ),
      ),
    );
  }
  rows.push(
    row(
      new ButtonBuilder()
        .setCustomId(`cfg:ovadd:${meta.name}`)
        .setLabel("Add Override")
        .setEmoji(EmberEmojis.parse(EmberEmojis.EDIT))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`cfg:open:${meta.name}`)
        .setLabel("Back")
        .setEmoji(EmberEmojis.parse(EmberEmojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return noPingCard(
    makeCard(
      EmberColors.PRIMARY,
      `${EmberEmojis.SHIELD} ${meta.displayName} • Overrides`,
      [
        lines.join("\n"),
        "-# Overrides apply a config value for a specific channel, role, user, or category.",
      ],
      { actionRows: rows },
    ),
  );
}
