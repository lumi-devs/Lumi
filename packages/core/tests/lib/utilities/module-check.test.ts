import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { checkModulesEnabled } from "#lib/module-check.js";

describe("Module Check Utilities (checkModulesEnabled)", () => {
  let areModulesEnabledMock: any;

  beforeEach(() => {
    vi.useFakeTimers();

    areModulesEnabledMock = vi.fn();
    (container as any).db = {
      modules: {
        areModulesEnabled: areModulesEnabledMock,
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls container.db.modules.areModulesEnabled and returns result", async () => {
    const resultMap = new Map([
      ["afk", true],
      ["filter", false],
    ]);
    areModulesEnabledMock.mockResolvedValue(resultMap);

    const promise = checkModulesEnabled("guild-123", ["afk", "filter"]);
    const res = await promise;

    expect(res).toBe(resultMap);
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(1);
    expect(areModulesEnabledMock).toHaveBeenCalledWith("guild-123", ["afk", "filter"]);
  });

  it("coalesces concurrent lookup calls for the same guild and module list within window", async () => {
    const resultMap = new Map([["afk", true]]);
    areModulesEnabledMock.mockResolvedValue(resultMap);

    const call1 = checkModulesEnabled("guild-batch", ["afk"]);
    const call2 = checkModulesEnabled("guild-batch", ["afk"]);

    expect(areModulesEnabledMock).toHaveBeenCalledTimes(1);

    const res1 = await call1;
    const res2 = await call2;

    expect(res1).toBe(resultMap);
    expect(res2).toBe(resultMap);
  });

  it("queries DB again if subsequent call requests missing modules not in cache", async () => {
    const map1 = new Map([["afk", true]]);
    const map2 = new Map([
      ["afk", true],
      ["filter", true],
    ]);

    areModulesEnabledMock.mockResolvedValueOnce(map1).mockResolvedValueOnce(map2);

    const call1 = checkModulesEnabled("guild-missing", ["afk"]);
    await call1;
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(1);

    const call2 = checkModulesEnabled("guild-missing", ["afk", "filter"]);
    const res2 = await call2;

    expect(areModulesEnabledMock).toHaveBeenCalledTimes(2);
    expect(res2).toBe(map2);
  });

  it("evicts cached entries after window duration (200ms)", async () => {
    const map1 = new Map([["afk", true]]);
    const map2 = new Map([["afk", false]]);

    areModulesEnabledMock.mockResolvedValueOnce(map1).mockResolvedValueOnce(map2);

    await checkModulesEnabled("guild-expire", ["afk"]);
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(1);

    // Fast forward fake timers past WINDOW_MS (200ms + 10ms cleanup timer)
    vi.advanceTimersByTime(250);

    const res2 = await checkModulesEnabled("guild-expire", ["afk"]);
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(2);
    expect(res2).toBe(map2);
  });

  it("does not evict cache entry if timestamp was refreshed by subsequent call", async () => {
    const map1 = new Map([["afk", true]]);
    const map2 = new Map([
      ["afk", true],
      ["filter", true],
    ]);

    areModulesEnabledMock.mockResolvedValueOnce(map1).mockResolvedValueOnce(map2);

    // Initial call at t=0
    const promise1 = checkModulesEnabled("guild-refresh", ["afk"]);
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(1);

    // Advance time slightly to t=50
    vi.advanceTimersByTime(50);

    // Refresh call requesting new module updates entry timestamp to t=50
    const promise2 = checkModulesEnabled("guild-refresh", ["afk", "filter"]);
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(2);

    // Advance time to t=215 (when first cleanup timer from t=0 fires)
    vi.advanceTimersByTime(165);

    // Cache should NOT be evicted by first cleanup timer because timestamp changed from 0 to 50
    // Subsequent lookup at t=215 for cached modules returns cached promise without extra DB query
    const res3 = await checkModulesEnabled("guild-refresh", ["afk", "filter"]);
    expect(res3).toBe(map2);
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(2);

    // Advance time past the refreshed cleanup timer (t = 50 + 210 = 260ms, advance by 50ms to t=265)
    vi.advanceTimersByTime(50);

    // Cache is now evicted; next request queries DB again
    const map3 = new Map([["afk", true], ["filter", true]]);
    areModulesEnabledMock.mockResolvedValueOnce(map3);
    const res4 = await checkModulesEnabled("guild-refresh", ["afk", "filter"]);
    expect(res4).toBe(map3);
    expect(areModulesEnabledMock).toHaveBeenCalledTimes(3);

    await promise1;
    await promise2;
  });
});
