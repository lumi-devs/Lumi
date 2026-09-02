import { FieldType, type ConfigField } from "#lib/module-system/Module.js";
import { formatSubtitle, formatPageFooter } from "#lib/utilities/ui/layout.js";
import { Emojis } from "#utilities/assets.js";
import {
  ActionRowBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  channelMention,
  roleMention,
  userMention,
} from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

/** Wraps components in an action row, saving the generic parameter at every call site. */
export function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );
}

export { formatSubtitle, formatPageFooter };

/**
 * Renders a stored config value the way the panel displays it.
 *
 * @remarks
 *
 * Snowflake-shaped values are rendered as mentions when the field is a list or
 * when a plain string field holds a comma-separated snowflake list; the mention
 * type is inferred from the field key containing `role`, `channel` or `user`.
 *
 * @param field - The schema entry the value belongs to.
 * @param value - The stored value; falls back to {@linkcode ConfigField.default}.
 */
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
