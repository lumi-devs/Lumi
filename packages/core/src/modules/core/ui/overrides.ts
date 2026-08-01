import type { ModuleMeta } from "#lib/module-system/Module.js";
import type {
  ConfigHistoryEntry,
  ConfigOverrideEntry,
} from "#lib/prisma/DatabaseService.js";
import {
  formatFieldValue,
  formatSubtitle,
  row,
  type Row,
} from "#modules/core/ui/common.js";
import { Emojis } from "#utilities/assets.js";
import {
  CARD_ACCENTS,
  makeCard,
  noPingCard,
  type CardReply,
} from "#utilities/cards.js";
import {
  buildSafeActionRows,
  createActionButton,
  createBackButton,
  createChannelSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
} from "#utilities/panels.js";
import { StringSelectMenuOptionBuilder } from "@discordjs/builders";
import {
  channelMention,
  roleMention,
  time,
  TimestampStyles,
  userMention,
} from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { ButtonStyle } from "discord.js";

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

/**
 * The configuration change log of a module, with a rollback picker listing
 * every entry that recorded a previous value.
 *
 * @param page - The detail subsection the back button returns to.
 */
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
    row(createBackButton(`cfg:open:${meta.name}:${page}`, "← Back to Feature")),
  );

  if (rollbackable.length) {
    const rbSelect = createStringSelectMenu({
      customId: `cfg:rb:${meta.name}:${page}`,
      placeholder: "Roll back a change…",
      options: rollbackable.slice(0, 25).map((e) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cutText(`Restore ${labelFor(e.key)}`, 100))
          .setValue(e.id)
          .setDescription(cutText(`Roll back to its previous value`, 100)),
      ),
    });
    rows.push(row(rbSelect));
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

/**
 * The per-target override list of a module, with an add button and a removal
 * picker keyed by `modelType|modelId|key`.
 *
 * @param page - The detail subsection the back button returns to.
 */
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
    row(
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
    rows.push(row(rmSelect));
  }

  return noPingCard(
    makeCard(
      CARD_ACCENTS.PURPLE,
      `${Emojis.SHIELD} ${meta.displayName} • Overrides`,
      [
        formatSubtitle(
          "Targeted configuration overrides for channels, roles, and users.",
        ),
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

  const backRow = row(
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
        row(keyMenu),
        row(roleMenu),
        row(channelMenu),
        row(userMenu),
      ]),
    },
  );
}
