import type { ChannelType } from "discord.js";

// Module configuration schema contracts.


export enum FieldType {
  BOOLEAN = "BOOLEAN",
  NUMBER = "NUMBER",
  STRING = "STRING",
  ENUM = "ENUM",
  CHANNEL = "CHANNEL",
  ROLE = "ROLE",
  USER = "USER",
  DURATION = "DURATION",
  MULTI_ROLE = "MULTI_ROLE",
  MULTI_CHANNEL = "MULTI_CHANNEL",
  MULTI_USER = "MULTI_USER",
  STRING_LIST = "STRING_LIST",
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
}
