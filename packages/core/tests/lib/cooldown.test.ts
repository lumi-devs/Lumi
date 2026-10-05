import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { claimCooldown, isOnCooldown } from "#lib/cooldown.js";

Object.assign(container, {
  valkey: {
    set: vi.fn(),
    exists: vi.fn(),
  },
});

describe("cooldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("claimCooldown", () => {
    it("claims once and returns false on a second call within the window", async () => {
      (container.valkey.set as any)
        .mockResolvedValueOnce("OK")
        .mockResolvedValueOnce(null);

      await expect(claimCooldown("cd-key", 5000)).resolves.toBe(true);
      await expect(claimCooldown("cd-key", 5000)).resolves.toBe(false);

      expect(container.valkey.set).toHaveBeenCalledWith(
        "cd-key",
        "1",
        "PX",
        5000,
        "NX",
      );
    });
  });

  describe("isOnCooldown", () => {
    it("reflects claimed state", async () => {
      (container.valkey.exists as any).mockResolvedValueOnce(0);
      await expect(isOnCooldown("cd-key")).resolves.toBe(false);

      (container.valkey.exists as any).mockResolvedValueOnce(1);
      await expect(isOnCooldown("cd-key")).resolves.toBe(true);

      expect(container.valkey.exists).toHaveBeenCalledWith("cd-key");
    });
  });
});
