import type { MessageMentionOptions } from "discord.js";
import type { ContainerBuilder } from "@discordjs/builders";

export interface CardReply {
  readonly flags?: number;
  readonly components: readonly ContainerBuilder[];
  readonly allowedMentions?: MessageMentionOptions;
}

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "grey" | "purple";
