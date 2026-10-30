import type { ModuleServices } from "@lumi/module-kit";
import { createKeys } from "@lumi/redis";
import {
  deleteStored,
  getStoredJson,
  redisOf,
  securityKey,
  setStoredJson,
} from "../shared.js";

const keys = createKeys();

const LockedModules = ["moderation-mod"];

export interface PanicState {
  until: number;
  startedAt: number;
  reason: string;
  by: string;
  lockModCommands: boolean;
}

export function panicKey(guildId: string): string {
  return securityKey("panic", guildId);
}

export async function getPanic(
  services: ModuleServices,
  guildId: string,
): Promise<PanicState | null> {
  const redis = redisOf(services);
  const state = await getStoredJson<PanicState>(redis, panicKey(guildId));
  if (!state) return null;
  if (state.until <= Date.now()) {
    await endPanic(services, guildId);
    return null;
  }
  return state;
}

export async function startPanic(
  services: ModuleServices,
  guildId: string,
  minutes: number,
  reason: string,
  by: string,
  lockModCommands: boolean,
): Promise<PanicState> {
  const redis = redisOf(services);
  const now = Date.now();
  const state: PanicState = {
    until: now + minutes * 60_000,
    startedAt: now,
    reason,
    by,
    lockModCommands,
  };
  const ttlSeconds = Math.max(1, Math.ceil((state.until - now) / 1000));
  await setStoredJson(redis, panicKey(guildId), state, ttlSeconds + 300);
  if (lockModCommands && redis) {
    for (const moduleName of LockedModules) {
      await redis
        .set(keys.moduleLock(guildId, moduleName), "1", "EX", ttlSeconds)
        .catch(() => undefined);
    }
  }
  return state;
}

export async function endPanic(
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const redis = redisOf(services);
  await deleteStored(redis, panicKey(guildId));
  if (!redis) return;
  for (const moduleName of LockedModules) {
    await redis
      .del(keys.moduleLock(guildId, moduleName))
      .catch(() => undefined);
  }
}
