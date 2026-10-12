import { describe, it, expect, vi } from "bun:test";
import {
  addBeforeInvokeHook,
  removeBeforeInvokeHook,
  runBeforeInvokeHooks,
} from "#src/lib/commands/Hooks.js";

const ctx = {} as any;

describe("beforeInvoke hooks", () => {
  it("returns null when no hooks allow and none deny", async () => {
    addBeforeInvokeHook("p6-empty-a", () => null);
    try {
      await expect(runBeforeInvokeHooks(ctx)).resolves.toBeNull();
    } finally {
      removeBeforeInvokeHook("p6-empty-a");
    }
  });

  it("returns the first denial and skips later hooks", async () => {
    const second = vi.fn().mockReturnValue(null);
    addBeforeInvokeHook("p6-first", () => ({ reason: "nope" }));
    addBeforeInvokeHook("p6-second", second);
    try {
      await expect(runBeforeInvokeHooks(ctx)).resolves.toEqual({
        reason: "nope",
      });
      expect(second).not.toHaveBeenCalled();
    } finally {
      removeBeforeInvokeHook("p6-first");
      removeBeforeInvokeHook("p6-second");
    }
  });

  it("supports async hooks and removal", async () => {
    const fn = vi.fn().mockResolvedValue(null);
    addBeforeInvokeHook("p6-async", fn);
    await expect(runBeforeInvokeHooks(ctx)).resolves.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(removeBeforeInvokeHook("p6-async")).toBe(true);
    expect(removeBeforeInvokeHook("p6-async")).toBe(false);
    await expect(runBeforeInvokeHooks(ctx)).resolves.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
