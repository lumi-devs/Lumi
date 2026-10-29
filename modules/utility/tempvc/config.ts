import {
  type TempVcConfig,
  TempVcConfigSchema,
} from "./panel.js";

export const TempVcModuleName = "utility-tempvc";
export const TempVcConfigKey = TempVcModuleName;

export const isModuleEnabled = (services: any, guildId: string): boolean =>
  services?.modules?.isEnabled?.(guildId, TempVcModuleName) ?? true;

export async function getTempVcConfig(
  services: any,
  guildId: string,
): Promise<TempVcConfig> {
  let raw: unknown = {};
  try {
    raw = (await services?.config?.get?.(guildId, TempVcConfigKey)) ?? {};
  } catch {
    raw = {};
  }
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (!Array.isArray(source.generators)) source.generators = [];
  try {
    return TempVcConfigSchema.parse(source);
  } catch {
    return TempVcConfigSchema.parse({});
  }
}

export async function saveTempVcConfig(
  services: any,
  guildId: string,
  config: TempVcConfig,
): Promise<boolean> {
  if (typeof services?.config?.set !== "function") return false;
  try {
    await services.config.set(guildId, TempVcConfigKey, config);
    return true;
  } catch {
    return false;
  }
}
