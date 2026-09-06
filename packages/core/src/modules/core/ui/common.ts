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
 * @param field - The schema entry the value belongs to.
 * @param value - The stored value; falls back to {@linkcode ConfigField.default}.
 */
export function formatFieldValue(field: ConfigField, value: unknown): string {
  const val = value ?? field.default ?? null;
  if (val === null || val === "") return "-# *(not set)*";

  switch (field.type) {
    case FieldType.Channel:
      return channelMention(String(val));
    case FieldType.Role:
      return roleMention(String(val));
    case FieldType.MultiChannel: {
      const ids = Array.isArray(val) ? val : [];
      if (ids.length === 0) return "-# *(not set)*";
      return ids.map((id) => channelMention(String(id))).join(", ");
    }
    case FieldType.MultiRole: {
      const ids = Array.isArray(val) ? val : [];
      if (ids.length === 0) return "-# *(not set)*";
      return ids.map((id) => roleMention(String(id))).join(", ");
    }
    case FieldType.MultiUser: {
      const ids = Array.isArray(val) ? val : [];
      if (ids.length === 0) return "-# *(not set)*";
      return ids.map((id) => userMention(String(id))).join(", ");
    }
    case FieldType.StringList: {
      const items = Array.isArray(val) ? val.map(String) : [];
      if (items.length === 0) return "-# *(not set)*";
      return `\`${cutText(items.join(", "), 120)}\``;
    }
    case FieldType.User:
      return userMention(String(val));
    case FieldType.Boolean:
      return val ? `${Emojis.Check} Yes` : `${Emojis.Cross} No`;
    default:
      return `\`${cutText(String(val), 120)}\``;
  }
}
