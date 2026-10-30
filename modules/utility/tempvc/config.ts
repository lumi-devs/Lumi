import type { ModuleServices } from "@lumi/module-kit";
import { type TempVcConfig, TempVcConfigSchema } from "./panel.js";

export const TempVcModuleName = "utility-tempvc";
export const TempVcConfigKey = TempVcModuleName;

export const isModuleEnabled = (
  services: ModuleServices,
  guildId: string,
): boolean => services.modules.isEnabled(guildId, TempVcModuleName);

export async function getTempVcConfig(
  services: ModuleServices,
  guildId: string,
): Promise<TempVcConfig> {
  let raw: unknown = {};
  try {
    raw = (await services.config.get(guildId, TempVcConfigKey)) ?? {};
  } catch (error) {
    services.observability?.logger?.warn?.("tempvc config read failed", {
      guildId,
      error,
    });
    raw = {};
  }
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (!Array.isArray(source.generators)) source.generators = [];
  try {
    return TempVcConfigSchema.parse(source);
  } catch (error) {
    services.observability?.logger?.warn?.(
      "tempvc config invalid, using defaults",
      { guildId, error },
    );
    return TempVcConfigSchema.parse({});
  }
}

export async function saveTempVcConfig(
  services: ModuleServices,
  guildId: string,
  config: TempVcConfig,
): Promise<boolean> {
  if (typeof services.config.set !== "function") return false;
  try {
    await services.config.set(guildId, TempVcConfigKey, config);
    return true;
  } catch (error) {
    services.observability?.logger?.warn?.("tempvc config save failed", {
      guildId,
      error,
    });
    return false;
  }
}
