import { Colors as DiscordColors } from "discord.js";
export * from "./misc.js";

export const Colors = {
  ...DiscordColors,
  PRIMARY: 0x5865f2,
  SUCCESS: 0x57f287,
  WARNING: 0xfee75c,
  ERROR: 0xed4245,
  INFO: 0x5865f2,
} as const;
