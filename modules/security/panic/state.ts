import type { ModuleServices } from "@lumi/module-kit";
import {
  deleteStored,
  getStoredJson,
  securityKey,
  setStoredJson,
} from "../../shared/security.js";

const LockedModules = ["mod"];

function moduleLockKey(guildId: string, moduleName: string): string {
  return ["lumi", "lock", "module", guildId, moduleName].join(":");
}

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
  const state = await getStoredJson<PanicState>(services, panicKey(guildId));
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
  const now = Date.now();
  const state: PanicState = {
    until: now + minutes * 60_000,
    startedAt: now,
    reason,
    by,
    lockModCommands,
  };
  const ttlSeconds = Math.max(1, Math.ceil((state.until - now) / 1000));
  await setStoredJson(services, panicKey(guildId), state, ttlSeconds + 300);
  if (lockModCommands) {
    for (const moduleName of LockedModules) {
      await services.helpers.cache
        .setString(moduleLockKey(guildId, moduleName), "1", ttlSeconds * 1000)
        .catch(() => undefined);
    }
  }
  return state;
}

export async function endPanic(
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  await deleteStored(services, panicKey(guildId));
  for (const moduleName of LockedModules) {
    await services.helpers.cache
      .del(moduleLockKey(guildId, moduleName))
      .catch(() => undefined);
  }
}
