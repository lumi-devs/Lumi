import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import { handleDataRetentionFire } from "#modules/core/index.js";

describe("core data retention sweep", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    (container as any).db = {
      audit: { purgeOldEntries: vi.fn().mockResolvedValue(1) },
      moderation: { purgeOldCases: vi.fn().mockResolvedValue(2) },
      configHistory: { purgeOldEntries: vi.fn().mockResolvedValue(3) },
      economy: { purgeOldTransactions: vi.fn().mockResolvedValue(4) },
    };
    (container as any).logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("purges config history and economy transactions alongside audit/moderation", async () => {
    await handleDataRetentionFire();

    expect(container.db.audit.purgeOldEntries).toHaveBeenCalledTimes(1);
    expect(container.db.moderation.purgeOldCases).toHaveBeenCalledTimes(1);
    expect(container.db.configHistory.purgeOldEntries).toHaveBeenCalledTimes(1);
    expect(container.db.economy.purgeOldTransactions).toHaveBeenCalledTimes(1);
    expect(container.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("module config history entries"),
    );
  });

  it("respects the configured retention windows", async () => {
    process.env.CONFIG_HISTORY_RETENTION_DAYS = "10";
    process.env.ECONOMY_TRANSACTION_RETENTION_DAYS = "20";

    await handleDataRetentionFire();

    const [configHistoryDate] = vi.mocked(
      container.db.configHistory.purgeOldEntries,
    ).mock.calls[0] as [Date];
    const [economyDate] = vi.mocked(
      container.db.economy.purgeOldTransactions,
    ).mock.calls[0] as [Date];

    const now = Date.now();
    expect(now - configHistoryDate.getTime()).toBeGreaterThan(9 * 86400000);
    expect(now - configHistoryDate.getTime()).toBeLessThan(11 * 86400000);
    expect(now - economyDate.getTime()).toBeGreaterThan(19 * 86400000);
    expect(now - economyDate.getTime()).toBeLessThan(21 * 86400000);
  });

  it("logs and swallows errors instead of throwing", async () => {
    vi.mocked(container.db.configHistory.purgeOldEntries).mockRejectedValue(
      new Error("db down"),
    );

    await expect(handleDataRetentionFire()).resolves.toBeUndefined();
    expect(container.logger.error).toHaveBeenCalled();
  });
});
