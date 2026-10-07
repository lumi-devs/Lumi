import type { Container } from "#lib/services.js";

export async function isAfkNickPrefixEnabled(
  services: Container,
  guildId: string,
): Promise<boolean> {
  const value = await services.db.config.getModuleConfig(
    guildId,
    "afk",
    "nick_prefix_enabled",
  );
  return value !== false;
}
