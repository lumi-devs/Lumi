import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import { isFlagEnabled } from "#lib/feature-flags/index.js";

describe("isFlagEnabled", () => {
  let getOverride: ReturnType<typeof vi.fn>;
  let getFlagForEvaluation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getOverride = vi.fn().mockResolvedValue(null);
    getFlagForEvaluation = vi.fn().mockResolvedValue(null);
    (container as any).db = {
      featureFlags: { getOverride, getFlagForEvaluation },
    };
  });

  it("returns false for an unknown key", async () => {
    await expect(isFlagEnabled(container, "unknown")).resolves.toBe(false);
    expect(getOverride).not.toHaveBeenCalled();
  });

  it("returns false when the flag is disabled, regardless of rolloutPercent", async () => {
    getFlagForEvaluation.mockResolvedValue({ enabled: false, rolloutPercent: 100 });
    await expect(isFlagEnabled(container, "flag")).resolves.toBe(false);
  });

  it("returns true when enabled at 100% rollout", async () => {
    getFlagForEvaluation.mockResolvedValue({ enabled: true, rolloutPercent: 100 });
    await expect(isFlagEnabled(container, "flag", "123")).resolves.toBe(true);
  });

  it("returns false when enabled at 0% rollout", async () => {
    getFlagForEvaluation.mockResolvedValue({ enabled: true, rolloutPercent: 0 });
    await expect(isFlagEnabled(container, "flag", "123")).resolves.toBe(false);
  });

  it("does not consult overrides when no guildId is given", async () => {
    getFlagForEvaluation.mockResolvedValue({ enabled: true, rolloutPercent: 100 });
    await isFlagEnabled(container, "flag");
    expect(getOverride).not.toHaveBeenCalled();
  });

  it("a guild override of true wins even when the flag is globally disabled", async () => {
    getOverride.mockResolvedValue({ enabled: true });
    getFlagForEvaluation.mockResolvedValue({ enabled: false, rolloutPercent: 0 });
    await expect(isFlagEnabled(container, "flag", "123")).resolves.toBe(true);
  });

  it("a guild override of false wins even when the flag is globally enabled at 100%", async () => {
    getOverride.mockResolvedValue({ enabled: false });
    getFlagForEvaluation.mockResolvedValue({ enabled: true, rolloutPercent: 100 });
    await expect(isFlagEnabled(container, "flag", "123")).resolves.toBe(false);
  });

  it("falls through to rollout evaluation when no override exists for the guild", async () => {
    getOverride.mockResolvedValue(null);
    getFlagForEvaluation.mockResolvedValue({ enabled: true, rolloutPercent: 100 });
    await expect(isFlagEnabled(container, "flag", "123")).resolves.toBe(true);
    expect(getOverride).toHaveBeenCalledWith("flag", "123");
    expect(getFlagForEvaluation).toHaveBeenCalledWith("flag");
  });

  it("is deterministic for a mid-range rollout: same (key, guild) always resolves the same way", async () => {
    getFlagForEvaluation.mockResolvedValue({ enabled: true, rolloutPercent: 50 });
    const first = await isFlagEnabled(container, "flag", "555555555555555555");
    const second = await isFlagEnabled(container, "flag", "555555555555555555");
    expect(first).toBe(second);
  });
});
