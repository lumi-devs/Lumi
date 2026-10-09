import type { Container } from "#lib/services.js";
import { TempvcCreateCooldownMs, TempvcMaxGenerators } from "./constants.js";

export async function getCreateCooldownMs(services: Container, guildId: string): Promise<number> {
  const value = await services.db.config.getModuleConfig(
    guildId,
    "tempvc",
    "create_cooldown_seconds",
  );
  return typeof value === "number" ? value * 1_000 : TempvcCreateCooldownMs;
}

export async function getMaxGenerators(services: Container, guildId: string): Promise<number> {
  const value = await services.db.config.getModuleConfig(
    guildId,
    "tempvc",
    "max_generators",
  );
  return typeof value === "number" ? value : TempvcMaxGenerators;
}
