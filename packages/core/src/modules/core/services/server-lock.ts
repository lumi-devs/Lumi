import type { DatabaseService } from "#lib/prisma/DatabaseService.js";

export interface ServerLockState {
  enabled: boolean;
  guildIds: string[];
}

type GlobalStore = Pick<DatabaseService, "global">;

export async function getServerLockState(
  db: GlobalStore,
): Promise<ServerLockState> {
  const config = await db.global.getGlobalConfig();
  return {
    enabled: config.serverLockEnabled,
    guildIds: config.serverLockGuildIds,
  };
}

export async function setServerLockState(
  db: GlobalStore,
  state: ServerLockState,
): Promise<ServerLockState> {
  await db.global.updateGlobalConfig({
    serverLockEnabled: state.enabled,
    serverLockGuildIds: state.guildIds,
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
