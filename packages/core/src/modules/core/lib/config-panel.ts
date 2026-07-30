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

const formatSubtitle = (text: string) => `-# ${text}`;
const formatStatusBadge = (status: "enabled" | "disabled") =>
  status === "enabled"
    ? `${Emojis.SUCCESS} \`ENABLED\``
    : `${Emojis.ERROR} \`DISABLED\``;
import { backToHubRow } from "#modules/core/lib/hub-panel.js";
import { Emojis } from "#utilities/assets.js";
import {
  createActionButton,
  createBackButton,
  createChannelSelectMenu,
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  buildSafeActionRows,
} from "#utilities/panels.js";
import type {
  ConfigHistoryEntry,
  ConfigOverrideEntry,
} from "#lib/prisma/DatabaseService.js";

export const FEATURES_PER_PAGE = 25;

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

const hasFieldType = (meta: ModuleMeta, ...types: FieldType[]) =>
  (meta.configFields ?? []).some((f) => types.includes(f.type));

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

  const select = createStringSelectMenu({
    customId: `cfg:sel:${safePage}`,
    placeholder: "Select a feature to configure…",
    disabled: pageFeatures.length === 0,
    options: pageFeatures.length
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
  });

  const rows: Row[] = [
    backToHubRow(),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select),
  ];

  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: "cfg:page",
        currentPage: safePage,
        totalPages,
      }),
    );
  }

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.GEAR} Feature Modules`,
    [
      formatSubtitle("Browse and configure feature modules enabled for this server."),
      lines.length ? lines.join("\n") : "*No features registered.*",
    ],
    {
      footer:
        totalPages > 1
          ? `Page ${safePage + 1}/${totalPages} • Select a module to enable, disable, or configure it.`
          : "Select a module to enable, disable, or configure it.",
      actionRows: buildSafeActionRows(rows),
    },
  );
}

export function buildFeatureDetailView(
  meta: ModuleMeta,
  config: Record<string, unknown>,
  guildEnabled: boolean,
  page = 0,
): CardReply {
  const fields = meta.configFields ?? [];
  const statusBadge = formatStatusBadge(guildEnabled ? "enabled" : "disabled");

  const fieldLines = [`**Status:** ${statusBadge}`];
  for (const f of fields) {
    const req = f.required ? " *(required)*" : "";
    fieldLines.push(
      `**${f.label}:** ${formatFieldValue(f, config[f.key])}${req}`,
    );
  }

  const rows: Row[] = [];

  const primaryComponents: MessageActionRowComponentBuilder[] = [
    createActionButton({
      customId: `cfg:tog:${meta.name}:${page}`,
      label: guildEnabled ? "Disable Module" : "Enable Module",
      emoji: guildEnabled ? Emojis.CROSS : Emojis.CHECK,
      style: guildEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
    }),
  ];

  if (hasFieldType(meta, FieldType.STRING, FieldType.NUMBER)) {
    primaryComponents.push(
      createActionButton({
        customId: `cfg:cfg:${meta.name}:${page}`,
        label: "Configure…",
        emoji: Emojis.EDIT,
        style: ButtonStyle.Secondary,
      }),
    );
  }

  primaryComponents.push(
    createActionButton({
      customId: `cfg:rst:${meta.name}:${page}`,
      label: "Reset",
      emoji: Emojis.UNINSTALL,
      style: ButtonStyle.Secondary,
    }),
  );

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...primaryComponents),
  );

  const secondaryComponents: MessageActionRowComponentBuilder[] = [
    createBackButton(`cfg:back:${page}`, "← Back to Modules"),
    createActionButton({
      customId: `cfg:hist:${meta.name}:${page}`,
      label: "History",
      emoji: Emojis.CLOCK,
      style: ButtonStyle.Secondary,
    }),
  ];

  if (meta.configOverrides) {
    secondaryComponents.push(
      createActionButton({
        customId: `cfg:ovr:${meta.name}:${page}`,
        label: "Overrides",
        emoji: Emojis.SHIELD,
        style: ButtonStyle.Secondary,
      }),
    );
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...secondaryComponents),
  );

  // Chunk boolean fields (up to 5 boolean buttons per row)
  const boolFields = fields.filter((f) => f.type === FieldType.BOOLEAN);
  for (let i = 0; i < boolFields.length; i += 5) {
    const chunk = boolFields.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        ...chunk.map((f) => {
          const def = f.default === undefined ? false : Boolean(f.default);
          const on = Boolean(config[f.key] ?? def);
          return createActionButton({
            customId: `cfg:bool:${meta.name}:${f.key}:${page}`,
            label: `${on ? Emojis.CHECK : Emojis.CROSS} ${cutText(f.label, 40)}`,
            style: on ? ButtonStyle.Success : ButtonStyle.Secondary,
          });
        }),
      ),
    );
  }

  // Interactive entity select menus for Channel, Role, User, and Enum fields
  for (const f of fields) {
    const isRoleList = f.list && f.key.includes("role");
    const isChannelList = f.list && f.key.includes("channel");
    const isUserList = f.list && f.key.includes("user");

    if (f.type === FieldType.CHANNEL || isChannelList) {
      let channelTypes: ChannelType[] | undefined = f.channelTypes;
      if (!channelTypes || channelTypes.length === 0) {
        if (
          f.key.includes("base") ||
          f.key.includes("voice") ||
          f.key.includes("lounge")
        ) {
          channelTypes = [
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice,
          ];
        } else {
          channelTypes = [ChannelType.GuildText];
        }
      }
      const chBuilder = createChannelSelectMenu({
        customId: `cfg:ch:${meta.name}:${f.key}:${page}`,
        placeholder: `Set: ${cutText(f.label, 80)}`,
        channelTypes,
        minValues: 0,
        maxValues: isChannelList ? 25 : 1,
      });
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(chBuilder),
      );
    } else if (f.type === FieldType.ROLE || isRoleList) {
      const roleBuilder = createRoleSelectMenu({
        customId: `cfg:role:${meta.name}:${f.key}:${page}`,
        placeholder: `Set: ${cutText(f.label, 80)}`,
        minValues: 0,
        maxValues: isRoleList ? 25 : 1,
      });
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(roleBuilder),
      );
    } else if (f.type === FieldType.USER || isUserList) {
      const userBuilder = createUserSelectMenu({
        customId: `cfg:user:${meta.name}:${f.key}:${page}`,
        placeholder: `Set: ${cutText(f.label, 80)}`,
        minValues: 0,
        maxValues: isUserList ? 25 : 1,
      });
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(userBuilder),
      );
    } else if (f.type === FieldType.ENUM && f.choices?.length) {
      const current = config[f.key];
      const enumBuilder = createStringSelectMenu({
        customId: `cfg:enum:${meta.name}:${f.key}:${page}`,
        placeholder: `Set: ${cutText(f.label, 80)}`,
        options: f.choices.slice(0, 25).map((choice) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cutText(choice, 100))
            .setValue(choice)
            .setDefault(choice === current),
        ),
      });
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(enumBuilder),
      );
    }
  }

  return noPingCard(
    makeCard(
      guildEnabled ? CARD_ACCENTS.PRIMARY : CARD_ACCENTS.WARNING,
      `${meta.emoji} ${meta.displayName}`,
      [
        formatSubtitle(meta.description || "No description provided."),
        fieldLines.join("\n"),
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
          `**${labelFor(e.key)}** — ${fmt(e.key, e.oldValue)} → ${fmt(e.key, e.newValue)}\n-# by ${userMention(e.actorId)} • ${time(e.createdAt, TimestampStyles.RelativeTime)}`,
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
          `\`${o.key}\` — ${o.modelType} ${overrideTargetMention(o)} → \`${cutText(String(o.value), 60)}\``,
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
