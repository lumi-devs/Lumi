import { ContainerBuilder, type ActionRowBuilder } from "@discordjs/builders";
import type { MessageMentionOptions } from "discord.js";
import type { LumiT } from "#lib/i18n/index.js";

export interface ViewContext {
  userId: string;
  guildId?: string | null;
  sessionId: string;
  t?: LumiT;
  data?: Record<string, unknown>;
}

export type MessageComponent = ContainerBuilder | ActionRowBuilder<any>;

export interface CardReply {
  readonly flags?: number;
  readonly embeds?: any[];
  readonly components: any[];
  readonly allowedMentions?: MessageMentionOptions;
}

export interface View {
  id: string;
  label: string;
  render(ctx: ViewContext): CardReply | Promise<CardReply>;
}

export interface MenuEntry {
  id: string;
  label: string;
  description?: string;
  emoji?: string;
  count?: number;
  view?: View;
  disabled?: boolean;
}

export interface Field {
  label: string;
  value: string;
  inline?: boolean;
  color?: "green" | "red" | "yellow" | "blue" | "grey" | "purple";
}

export interface StatItem {
  label: string;
  value: string;
  trend?: "up" | "down" | "stable";
  sublabel?: string;
}

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "grey" | "purple";

export interface NavButton {
  customId: string;
  label: string;
  emoji?: string;
  style?: number;
  disabled?: boolean;
}