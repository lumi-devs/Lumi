import type { ChannelType } from "discord.js";

// Module configuration schema contracts.


export enum FieldType {
  Boolean = "BOOLEAN",
  Number = "NUMBER",
  String = "STRING",
  Enum = "ENUM",
  Channel = "CHANNEL",
  Role = "ROLE",
  User = "USER",
  Duration = "DURATION",
  MultiRole = "MULTI_ROLE",
  MultiChannel = "MULTI_CHANNEL",
  MultiUser = "MULTI_USER",
  StringList = "STRING_LIST",
}

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  description: string;
  default?: unknown;
  choices?: string[];
  required?: boolean;
  /** For CHANNEL fields: restrict the channel-type picker. */
  channelTypes?: ChannelType[];
  /** NUMBER fields with `step` render as a range slider instead of a number box. */
  step?: number;
  /** DURATION quick-pick presets (e.g. `["5m", "15m", "1h", "24h", "7d"]`). */
  quickPicks?: string[];
  /** Section this field belongs to in the config panel. Fields sharing a group
   * render together as one navigable subsection; omit for small modules. */
  group?: string;
  /** Coarser split above `group`, for modules whose dashboard page is divided
   * into tabs. Groups sharing a section become subsections of one tab, in
   * declaration order. Omit and the module renders as a single section. */
  section?: string;
}
