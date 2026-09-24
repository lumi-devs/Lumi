import { container } from "@sapphire/framework";

export async function isAfkNickPrefixEnabled(
  guildId: string,
): Promise<boolean> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "afk",
    "nick_prefix_enabled",
  );
  return value !== false;
}
