import type { DatabaseService } from "#src/lib/prisma/DatabaseService.js";

interface ServerLockState {
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

export function shouldLeaveOnJoin(
  state: ServerLockState,
  guildId: string,
): boolean {
  return state.enabled && !state.guildIds.includes(guildId);
}
