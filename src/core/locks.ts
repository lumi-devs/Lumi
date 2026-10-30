import { createKeys } from "@lumi/redis";
import type { Redis } from "ioredis";

const keys = createKeys();

export async function isModuleLocked(
  redis: Redis,
  guildId: string,
  moduleName: string,
): Promise<boolean> {
  const value = await redis.get(keys.moduleLock(guildId, moduleName));
  return value !== null;
}
