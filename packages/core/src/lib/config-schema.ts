import { s } from "@sapphire/shapeshift";

export const snowflakeString = () => s.string().regex(/^\d{17,20}$/);

export const durationString = () => s.string().regex(/^\d+[smhd]$/);

export function choiceEnum<T extends string>(opts: readonly T[]) {
  return s.enum(opts);
}
