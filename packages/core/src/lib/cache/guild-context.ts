import type { Container } from "@lumi/lib/services.js";
import { BrandColors } from "@lumi/lib/ui/palette.js";

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
export async function getGuildContext(services: Container, guildId: string): Promise<GuildContextData> {
  const [settings, ignoredGuild, brandColorConfig] = await Promise.all([
    services.db.config.getGuildSettings(guildId),
    services.db.access.isGuildIgnored(guildId),
    services.db.config.getModuleConfig(guildId, "core", "brandColor"),
  ]);

  return {
    locale: settings.locale,
    prefixes: settings.prefix ? [settings.prefix] : [],
    ignoredGuild,
    brandColor:
      typeof brandColorConfig === "number" ? brandColorConfig : BrandColors.primary,
  };
}
