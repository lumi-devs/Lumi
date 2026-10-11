import { FieldType, type ConfigField } from "#src/lib/module-system/ConfigSchema.js";
import { formatSubtitle, formatPageFooter } from "#src/lib/ui/Layout.js";
import { row, type Row } from "#src/lib/ui/Panels.js";
import {
  channelMention,
  roleMention,
  userMention,
} from "@discordjs/formatters";
import { cutText } from "#src/shared/Index.ts";

export { row, type Row };

export { formatSubtitle, formatPageFooter };

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
    case FieldType.ObjectArray: {
      const items = Array.isArray(val) ? val : [];
      if (items.length === 0) return "-# *(not set)*";
      return `\`${items.length} ${items.length === 1 ? "entry" : "entries"}\` - edit in dashboard`;
    }
    case FieldType.User:
      return userMention(String(val));
    case FieldType.Boolean:
      return val ? `✅ Yes` : `❌ No`;
    default:
      return `\`${cutText(String(val), 120)}\``;
  }
}
