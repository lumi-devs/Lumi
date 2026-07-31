import type { MessageMentionOptions } from "discord.js";

export interface CardReply {
  readonly flags?: number;
  readonly components: any[];
  readonly allowedMentions?: MessageMentionOptions;
}

export interface Field {
  label: string;
  value: string;
  inline?: boolean;
  color?: BadgeColor;
}

export interface StatItem {
  label: string;
  value: string;
  trend?: "up" | "down" | "stable";
  sublabel?: string;
}

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "grey" | "purple";
