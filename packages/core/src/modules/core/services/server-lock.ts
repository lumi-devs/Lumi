import type { Prisma } from "@prisma/client";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";

export interface ServerLockState {
  enabled: boolean;
  guildIds: string[];
}

const ServerLockExtraKey = "serverLock";

const DisabledState: ServerLockState = { enabled: false, guildIds: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the server-lock snapshot out of the `Global.extra` JSON blob.
 * Never throws - unknown shapes resolve to the disabled state.
 */
export function parseServerLockState(extra: unknown): ServerLockState {
  if (!isRecord(extra)) return { ...DisabledState };
  const raw = extra[ServerLockExtraKey];
  if (!isRecord(raw)) return { ...DisabledState };
  const guildIds = Array.isArray(raw["guildIds"])
    ? raw["guildIds"].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  return { enabled: raw["enabled"] === true, guildIds };
}

/**
 * Merges a server-lock snapshot into the existing `Global.extra` blob,
 * preserving any unrelated keys other features store there.
 */
export function buildServerLockExtra(
  current: unknown,
  state: ServerLockState,
): Record<string, Prisma.InputJsonValue> {
  const base: Record<string, Prisma.InputJsonValue> = isRecord(current)
    ? { ...(current as Record<string, Prisma.InputJsonValue>) }
    : {};
  base[ServerLockExtraKey] = { enabled: state.enabled, guildIds: state.guildIds };
  return base;
}

type GlobalStore = Pick<DatabaseService, "global">;

export async function getServerLockState(
  db: GlobalStore,
): Promise<ServerLockState> {
  const config = await db.global.getGlobalConfig();
  return parseServerLockState(config.extra);
}

export async function setServerLockState(
  db: GlobalStore,
  state: ServerLockState,
): Promise<ServerLockState> {
  const config = await db.global.getGlobalConfig();
  await db.global.updateGlobalConfig({
    extra: buildServerLockExtra(config.extra, state),
  });
  return state;
}

/** A freshly joined guild is locked out when the lock is on and it is not in the snapshot. */
export function shouldLeaveOnJoin(
  state: ServerLockState,
  guildId: string,
): boolean {
  return state.enabled && !state.guildIds.includes(guildId);
}
