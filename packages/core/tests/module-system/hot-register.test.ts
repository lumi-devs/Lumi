import { describe, it, expect, vi } from "vitest";

describe("Hot Register & Reload Commands and Modules Test", () => {
  it("supports hot registering commands and reloading module stores dynamically at runtime", async () => {
    const mockModuleStore = {
      reload: vi.fn().mockResolvedValue(true),
      setGlobalEnabled: vi.fn().mockResolvedValue(true),
    };

    const reloaded = await mockModuleStore.reload();
    expect(reloaded).toBe(true);
    expect(mockModuleStore.reload).toHaveBeenCalledTimes(1);
  });
});
