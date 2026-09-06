import { describe, expect, it, vi } from "vitest";
import {
  buildServerLockExtra,
  getServerLockState,
  parseServerLockState,
  setServerLockState,
  shouldLeaveOnJoin,
} from "../../../src/modules/core/lib/server-lock.js";

describe("parseServerLockState", () => {
  it("defaults to disabled for missing or malformed blobs", () => {
    expect(parseServerLockState(null)).toEqual({ enabled: false, guildIds: [] });
    expect(parseServerLockState(undefined)).toEqual({ enabled: false, guildIds: [] });
    expect(parseServerLockState("nope")).toEqual({ enabled: false, guildIds: [] });
    expect(parseServerLockState([])).toEqual({ enabled: false, guildIds: [] });
    expect(parseServerLockState({})).toEqual({ enabled: false, guildIds: [] });
    expect(parseServerLockState({ serverLock: "on" })).toEqual({
      enabled: false,
      guildIds: [],
    });
  });

  it("reads the enabled flag and snapshot", () => {
    expect(
      parseServerLockState({
        serverLock: { enabled: true, guildIds: ["1", "2"] },
      }),
    ).toEqual({ enabled: true, guildIds: ["1", "2"] });
  });

  it("drops non-string snapshot entries", () => {
    expect(
      parseServerLockState({
        serverLock: { enabled: true, guildIds: ["1", 2, null, ""] },
      }),
    ).toEqual({ enabled: true, guildIds: ["1"] });
  });
});

describe("buildServerLockExtra", () => {
  it("preserves unrelated keys already stored in the blob", () => {
    expect(
      buildServerLockExtra(
        { maintenanceNote: "hi", serverLock: { enabled: false, guildIds: [] } },
        { enabled: true, guildIds: ["9"] },
      ),
    ).toEqual({
      maintenanceNote: "hi",
      serverLock: { enabled: true, guildIds: ["9"] },
    });
  });

  it("starts from an empty object for missing or malformed blobs", () => {
    expect(
      buildServerLockExtra(null, { enabled: false, guildIds: [] }),
    ).toEqual({ serverLock: { enabled: false, guildIds: [] } });
    expect(
      buildServerLockExtra("junk", { enabled: true, guildIds: ["1"] }),
    ).toEqual({ serverLock: { enabled: true, guildIds: ["1"] } });
  });
});

describe("shouldLeaveOnJoin", () => {
  it("leaves only locked-out guilds while enabled", () => {
    const state = { enabled: true, guildIds: ["1"] };
    expect(shouldLeaveOnJoin(state, "2")).toBe(true);
    expect(shouldLeaveOnJoin(state, "1")).toBe(false);
    expect(shouldLeaveOnJoin({ enabled: false, guildIds: [] }, "2")).toBe(false);
  });
});

function makeDb(extra: unknown) {
  return {
    global: {
      getGlobalConfig: vi.fn().mockResolvedValue({ extra }),
      updateGlobalConfig: vi.fn().mockResolvedValue({ extra }),
    },
  } as any;
}

describe("getServerLockState / setServerLockState", () => {
  it("round-trips through the global store", async () => {
    const db = makeDb(null);
    await expect(getServerLockState(db)).resolves.toEqual({
      enabled: false,
      guildIds: [],
    });
  });

  it("merges the snapshot instead of replacing the blob", async () => {
    const db = makeDb({ other: 1 });
    await setServerLockState(db, { enabled: true, guildIds: ["7"] });
    expect(db.global.updateGlobalConfig).toHaveBeenCalledWith({
      extra: {
        other: 1,
        serverLock: { enabled: true, guildIds: ["7"] },
      },
    });
  });
});
