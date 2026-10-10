import { DiscordSnowflake } from "@sapphire/snowflake";

export function cleanMention(raw: string): string {
  return raw.replace(/[<@&#!>]/g, "");
}

const SnowflakePattern = /^\d{17,20}$/;

export function isSnowflakeId(value: unknown): value is string {
  if (typeof value !== "string" || !SnowflakePattern.test(value)) return false;
  try {
    DiscordSnowflake.deconstruct(value);
    return true;
  } catch {
    return false;
  }
}

export const fmtId = (id: unknown): string => (id ? String(id) : "unknown");
