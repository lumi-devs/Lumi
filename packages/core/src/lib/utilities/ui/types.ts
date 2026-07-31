import type { MessageMentionOptions } from "discord.js";

export interface CardReply {
  readonly flags?: number;
  readonly components: any[];
  readonly allowedMentions?: MessageMentionOptions;
}

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "grey" | "purple";
