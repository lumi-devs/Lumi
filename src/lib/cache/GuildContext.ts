import type { Container } from "#src/lib/Services.js";
import { BrandColors } from "#src/lib/ui/Palette.js";

export interface GuildContextData {
  locale: string;
  prefixes: string[];
  ignoredGuild: boolean;
  brandColor: number;
}

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
