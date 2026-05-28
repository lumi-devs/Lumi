import type { ChannelType } from "discord.js";

// Wire shape of a single configurable module setting. Derived in core from each
// module's Zod `configSchema`; consumed by the /config panel and the dashboard.

export enum FieldType {
  BOOLEAN = "BOOLEAN",
  NUMBER = "NUMBER",
  STRING = "STRING",
  ENUM = "ENUM",
  CHANNEL = "CHANNEL",
  ROLE = "ROLE",
  USER = "USER",
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
  /** STRING fields whose stored value is a comma-separated list (read as `string[]`). */
  list?: boolean;
}
