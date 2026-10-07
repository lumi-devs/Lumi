import type { Message } from "discord.js";

export type GuildMessage = Message<true>;

export const LumiEvents = {
  GuildUserMessage: "lumiGuildUserMessage",
  GuildUserMessageEdit: "lumiGuildUserMessageEdit",
} as const;

declare module "discord.js" {
  interface ClientEvents {
    lumiGuildUserMessage: [message: Message<true>];
    lumiGuildUserMessageEdit: [message: Message<true>];
  }
}

export interface ScheduledTasks {
  "flush-logs": Record<string, never>;
}
