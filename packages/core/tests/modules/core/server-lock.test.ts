import { describe, expect, it, vi } from "bun:test";
import {
  getServerLockState,
  setServerLockState,
  shouldLeaveOnJoin,
} from "#modules/core/services/server-lock.js";

describe("shouldLeaveOnJoin", () => {
  it("leaves only locked-out guilds while enabled", () => {
    const state = { enabled: true, guildIds: ["1"] };
    expect(shouldLeaveOnJoin(state, "2")).toBe(true);
    expect(shouldLeaveOnJoin(state, "1")).toBe(false);
    expect(shouldLeaveOnJoin({ enabled: false, guildIds: [] }, "2")).toBe(false);
  });
});

function makeDb(serverLockEnabled: boolean, serverLockGuildIds: string[]) {
  return {
    global: {
      getGlobalConfig: vi
        .fn()
        .mockResolvedValue({ serverLockEnabled, serverLockGuildIds }),
      updateGlobalConfig: vi
        .fn()
        .mockResolvedValue({ serverLockEnabled, serverLockGuildIds }),
    },
  } as any;
}

describe("getServerLockState / setServerLockState", () => {
  it("reads the typed columns straight off the global config row", async () => {
    const db = makeDb(false, []);
    await expect(getServerLockState(db)).resolves.toEqual({
      enabled: false,
      guildIds: [],
    });
  });

  it("writes the typed columns directly", async () => {
    const db = makeDb(false, []);
    await setServerLockState(db, { enabled: true, guildIds: ["7"] });
    expect(db.global.updateGlobalConfig).toHaveBeenCalledWith({
      serverLockEnabled: true,
      serverLockGuildIds: ["7"],
    });
  });
});
