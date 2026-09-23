import { container } from "@sapphire/framework";
import { BrandColors } from "#lib/branding/colors.js";

export interface GuildContextData {
  locale: string;
  prefixes: string[];
  ignoredGuild: boolean;
  brandColor: number;
}

/**
 * Composes an ergonomic per-guild read out of calls each already `getOrSet`
 * (CacheStore) backed by their own owning repository. This is deliberately
 * not its own cache entry/invalidation path: each field is already
 * independently cached and independently invalidated by its owner
 * (`ConfigRepository`, `AccessRepository`), so a cache entry here would just
 * be a second, harder-to-invalidate copy of data that's already fast.
 */
export async function getGuildContext(guildId: string): Promise<GuildContextData> {
  const [settings, ignoredGuild, brandColorConfig] = await Promise.all([
    container.db.config.getGuildSettings(guildId),
    container.db.access.isGuildIgnored(guildId),
    container.db.config.getModuleConfig(guildId, "core", "brandColor"),
  ]);

  return {
    locale: settings.locale,
    prefixes: settings.prefix ? [settings.prefix] : [],
    ignoredGuild,
    brandColor:
      typeof brandColorConfig === "number" ? brandColorConfig : BrandColors.primary,
  };
}
