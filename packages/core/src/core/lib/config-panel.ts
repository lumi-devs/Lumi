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
import {
  ButtonStyle,
  ChannelType,
  GuildMember,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { container } from "@sapphire/framework";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
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
import { tabRow } from "#core/lib/hub-panel.js";
import { Colors } from "#utilities/branding.js";
import { Emojis } from "#utilities/assets.js";
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
  // interaction.member may be a partial APIInteractionGuildMember (REST shape with
  // roles: string[]) rather than the full GuildMember. Only pass it through the
  // PermissionContext path when it's the resolved cache object with the full
  // GuildMemberRoleManager; otherwise fall back to userId-only resolution.
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

const row = (...components: MessageActionRowComponentBuilder[]): Row =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

/** The shared "← Back" navigation button; only the target customId varies. */
const backButton = (customId: string): ButtonBuilder =>
  new ButtonBuilder()
    .setCustomId(customId)
    .setLabel("Back")
    .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
    .setStyle(ButtonStyle.Secondary);

// ── Value formatting ──────────────────────────────────────────────────────

export function formatFieldValue(field: ConfigField, value: unknown): string {
  const val = value ?? field.default ?? null;
  if (val === null || val === undefined || val === "") return "-# *(not set)*";

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
            .filter(Boolean)
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
    const dot = f.guildEnabled ? Emojis.SUCCESS : Emojis.ERROR;
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
              .setEmoji(Emojis.parse(f.meta.emoji)),
          )
        : [
            new StringSelectMenuOptionBuilder()
              .setLabel("No features registered")
              .setValue("_none"),
          ],
    )
    .setDisabled(pageFeatures.length === 0);

  const rows: Row[] = [tabRow("modules"), row(select)];

  if (totalPages > 1) {
    rows.push(
      row(
        new ButtonBuilder()
          .setCustomId(`cfg:page:${safePage - 1}`)
          .setLabel("Prev")
          .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(`cfg:page:${safePage + 1}`)
          .setLabel("Next")
          .setEmoji(Emojis.parse(Emojis.ARROW_RIGHT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
      ),
    );
  }

  return makeCard(
    Colors.PRIMARY,
    `${Emojis.GEAR} Modules`,
    lines.length ? lines.join("\n") : "*No features registered.*",
    {
      footer:
        totalPages > 1
          ? `Page ${safePage + 1}/${totalPages} • Select a module to enable, disable, or configure it.`
          : "Select a module to enable, disable, or configure it.",
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
    ? `${Emojis.SUCCESS} **Enabled**`
    : `${Emojis.ERROR} **Disabled**`;

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
      .setEmoji(Emojis.parse(guildEnabled ? Emojis.CROSS : Emojis.CHECK))
      .setStyle(guildEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
  ];
  if (hasFieldType(meta, FieldType.STRING, FieldType.NUMBER)) {
    primary.push(
      new ButtonBuilder()
        .setCustomId(`cfg:cfg:${meta.name}`)
        .setLabel("Configure…")
        .setEmoji(Emojis.parse(Emojis.EDIT))
        .setStyle(ButtonStyle.Secondary),
    );
  }
  primary.push(
    new ButtonBuilder()
      .setCustomId(`cfg:rst:${meta.name}`)
      .setLabel("Reset")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(row(...primary));

  // Secondary actions
  const secondary = [
    backButton("cfg:back"),
    new ButtonBuilder()
      .setCustomId(`cfg:hist:${meta.name}`)
      .setLabel("History")
      .setEmoji(Emojis.parse(Emojis.CLOCK))
      .setStyle(ButtonStyle.Secondary),
  ];
  if (meta.configOverrides) {
    secondary.push(
      new ButtonBuilder()
        .setCustomId(`cfg:ovr:${meta.name}`)
        .setLabel("Overrides")
        .setEmoji(Emojis.parse(Emojis.SHIELD))
        .setStyle(ButtonStyle.Secondary),
    );
  }
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
              `${on ? Emojis.CHECK : Emojis.CROSS} ${cutText(f.label, 60)}`,
            )
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary);
        }),
      ),
    );
  }

  // Select-based fields (one row each)
  for (const f of fields) {
    const isRoleList = f.list && f.key.includes("role");
    const isChannelList = f.list && f.key.includes("channel");
    const isUserList = f.list && f.key.includes("user");

    if (f.type === FieldType.CHANNEL || isChannelList) {
      const chBuilder = new ChannelSelectMenuBuilder()
        .setCustomId(`cfg:ch:${meta.name}:${f.key}`)
        .setPlaceholder(`Set: ${cutText(f.label, 80)}`)
        .setMinValues(0)
        .setMaxValues(isChannelList ? 25 : 1);
      if (f.channelTypes?.length) {
        chBuilder.setChannelTypes(...f.channelTypes);
      } else if (
        f.key.includes("base") ||
        f.key.includes("voice") ||
        f.key.includes("lounge")
      ) {
        chBuilder.setChannelTypes(
          ChannelType.GuildVoice,
          ChannelType.GuildStageVoice,
        );
      } else {
        chBuilder.setChannelTypes(ChannelType.GuildText);
      }
      rows.push(row(chBuilder));
    } else if (f.type === FieldType.ROLE || isRoleList) {
      rows.push(
        row(
          new RoleSelectMenuBuilder()
            .setCustomId(`cfg:role:${meta.name}:${f.key}`)
            .setPlaceholder(`Set: ${cutText(f.label, 80)}`)
            .setMinValues(0)
            .setMaxValues(isRoleList ? 25 : 1),
        ),
      );
    } else if (f.type === FieldType.USER || isUserList) {
      rows.push(
        row(
          new UserSelectMenuBuilder()
            .setCustomId(`cfg:user:${meta.name}:${f.key}`)
            .setPlaceholder(`Set: ${cutText(f.label, 80)}`)
            .setMinValues(0)
            .setMaxValues(isUserList ? 25 : 1),
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
      guildEnabled ? Colors.SUCCESS : Colors.ERROR,
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
  rows.push(row(backButton(`cfg:open:${meta.name}`)));

  return noPingCard(
    makeCard(
      Colors.PRIMARY,
      `${Emojis.CLOCK} ${meta.displayName} • History`,
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
      backButton(`cfg:open:${meta.name}`),
      new ButtonBuilder()
        .setCustomId(`cfg:ovadd:${meta.name}`)
        .setLabel("Add Override")
        .setEmoji(Emojis.parse(Emojis.EDIT))
        .setStyle(ButtonStyle.Primary),
    ),
  );

  return noPingCard(
    makeCard(
      Colors.PRIMARY,
      `${Emojis.SHIELD} ${meta.displayName} • Overrides`,
      [
        lines.join("\n"),
        "-# Overrides apply a config value for a specific channel, role, user, or category.",
      ],
      { actionRows: rows },
    ),
  );
}
