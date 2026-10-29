const SnowflakePattern = /^\d{17,20}$/;

export function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && SnowflakePattern.test(value);
}

export interface IdListOptions {
  unique?: boolean;
}

export function asIdList(
  value: unknown,
  options: IdListOptions = {},
): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(isSnowflake);
  return options.unique === true ? [...new Set(ids)] : ids;
}

export function requireGuildId(
  guildId: string | null | undefined,
): string | null {
  return typeof guildId === "string" && guildId.length > 0 ? guildId : null;
}
