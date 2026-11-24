import { logger } from "@lumi/foundation";
import type { ConfigField } from "@lumi/module-kit";
import { getDashboardCache } from "./dashboardCache.js";
import { fetchModules, type RpcConfigField } from "./rpc.js";

export type { ConfigField };

const MODULE_CATALOG_TTL_MS = 60_000;

export interface CatalogModule {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  configKey: string;
  configFields: ConfigField[];
  isAddon: boolean;
  category: string | null;
  enabled: boolean;
}

function toConfigField(raw: RpcConfigField): ConfigField {
  return {
    key: raw.key,
    label: raw.label,
    type: raw.type as ConfigField["type"],
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(raw.required !== undefined ? { required: raw.required } : {}),
    ...(raw.default !== undefined ? { default: raw.default } : {}),
    ...(raw.choices !== undefined ? { choices: raw.choices } : {}),
    ...(raw.category !== undefined ? { category: raw.category } : {}),
    ...(raw.min !== undefined ? { min: raw.min } : {}),
    ...(raw.max !== undefined ? { max: raw.max } : {}),
    ...(raw.integer !== undefined ? { integer: raw.integer } : {}),
    ...(raw.channelTypes !== undefined
      ? { channelTypes: raw.channelTypes }
      : {}),
  };
}

export async function moduleCatalog(
  guildId: string,
): Promise<CatalogModule[] | null> {
  const cache = getDashboardCache();
  const cacheKey = `modules:catalog:${guildId}`;

  const cached = await cache.moduleCatalog.getOrLoad(
    cacheKey,
    MODULE_CATALOG_TTL_MS,
    async () => {
      const modules = await fetchModules(guildId);
      if (!modules) return null;

      const catalog: CatalogModule[] = modules
        .map((module) => ({
          name: module.name,
          displayName: module.displayName,
          emoji: module.emoji,
          description: module.description,
          version: module.version,
          configKey: module.configKey ?? module.name,
          configFields: module.configFields
            .map(toConfigField)
            .filter((field): field is ConfigField => field !== null),
          isAddon: module.origin === "addon",
          category: module.category,
          enabled: module.enabled,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      return catalog;
    },
  );
  return cached;
}

export async function invalidateModuleCatalog(guildId: string): Promise<void> {
  const cache = getDashboardCache();
  const cacheKey = `modules:catalog:${guildId}`;
  try {
    await cache.moduleCatalog.delete(cacheKey);
  } catch (error) {
    logger.warn("[dashboard] module catalog invalidation failed", {
      guildId,
      error,
    });
  }
}
