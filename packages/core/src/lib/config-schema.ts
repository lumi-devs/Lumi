import { z } from "zod";

export const snowflakeString = () =>
  z.string().regex(/^\d{17,20}$/, "Must be a Discord snowflake ID");

export const durationString = () =>
  z.string().regex(/^\d+[smhd]$/, "Must be e.g. 10m, 2h, 1d");

export function choiceEnum<T extends string>(opts: readonly T[]) {
  return z.enum(opts as [T, ...T[]]);
}
