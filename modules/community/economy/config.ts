import { z } from "zod";
import { EconomyConfigKey } from "./constants.js";

export const ShopItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.coerce.number().int().min(1),
  type: z.enum(["role", "item", "custom"]),
  roleId: z.string().optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
});

export const EconomyConfigSchema = z.object({
  currencyName: z.string().default("Credits"),
  currencySymbol: z.string().default("💰"),
  startingBalance: z.coerce.number().int().min(0).default(0),
  dailyAmount: z.coerce.number().int().min(0).default(100),
  weeklyAmount: z.coerce.number().int().min(0).default(500),
  taxRate: z.coerce.number().min(0).max(1).default(0),
  workCooldown: z.coerce.number().int().min(60).default(3600),
  workMinPay: z.coerce.number().int().min(1).default(50),
  workMaxPay: z.coerce.number().int().min(1).default(200),
  shopItems: z.array(ShopItemSchema).default([]),
});

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>;
export type ShopItem = z.infer<typeof ShopItemSchema>;

interface ConfigServices {
  config: {
    get(guildId: string, key: string): Promise<unknown>;
  };
  observability?: {
    logger?: {
      warn?: (message: string, meta?: unknown) => void;
    };
  };
}

export async function getEconomyConfig(
  services: ConfigServices,
  guildId: string,
): Promise<EconomyConfig> {
  const stored = await services.config.get(guildId, EconomyConfigKey);
  const parsed = EconomyConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "[economy] invalid configuration, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return EconomyConfigSchema.parse({});
}
