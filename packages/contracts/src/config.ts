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
