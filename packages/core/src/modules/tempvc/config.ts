import { container } from "@sapphire/framework";
import { TempvcCreateCooldownMs, TempvcMaxGenerators } from "./constants.js";

export async function getCreateCooldownMs(guildId: string): Promise<number> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "tempvc",
    "create_cooldown_seconds",
  );
  return typeof value === "number" ? value * 1_000 : TempvcCreateCooldownMs;
}

export async function getMaxGenerators(guildId: string): Promise<number> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "tempvc",
    "max_generators",
  );
  return typeof value === "number" ? value : TempvcMaxGenerators;
}
