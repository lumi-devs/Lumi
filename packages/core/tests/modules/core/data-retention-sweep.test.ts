import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "bun:test";
import { container } from "@sapphire/framework";
import { handleDataRetentionFire } from "#modules/core/services/data-retention.js";
import { readClusterShards } from "#lib/sharding/shard-telemetry.js";

// bun:test has no `vi.mocked` type-narrowing helper — these fields are real
// db-interface methods at the type level, stubbed with vi.fn() at runtime.
function asMock<T extends (...args: any[]) => any>(fn: T): Mock<T> {
  return fn as unknown as Mock<T>;
}

vi.mock("#lib/sharding/shard-telemetry.js", () => ({
  DefaultClusterName: "default",
  readClusterShards: vi.fn(),
}));

vi.mock("#lib/database/guild-eviction.js", () => ({
  evictGuildValkeyState: vi.fn().mockResolvedValue(undefined),
}));

const baseShard = {
  status: "Ready",
  ping: 10,
  guildCount: 1,
  shardCount: 2,
  updatedAt: 0,
  eventLoopLagP99Ms: null,
  memoryRssMb: 0,
  heapUsedMb: 0,
  uptimeSec: 0,
  pid: 0,
  lastReadyAt: null,
};
const fleetReady = {
  clusterName: "default",
  observedAt: 0,
  replicas: [],
  missingShardIds: [],
  shards: [
    { ...baseShard, shardId: 0, replicaId: "r1" },
    { ...baseShard, shardId: 1, replicaId: "r1" },
  ],
  shardCount: 2,
};
const fleetNotReady = {
  clusterName: "default",
  observedAt: 0,
  replicas: [],
  missingShardIds: [1],
  shards: [{ ...baseShard, shardId: 0, replicaId: "r1" }],
  shardCount: 2,
};

describe("core data retention sweep", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    (container as any).db = {
      audit: { purgeOldEntries: vi.fn().mockResolvedValue(1) },
      moderation: { purgeOldCases: vi.fn().mockResolvedValue(2) },
      appeals: { purgeOldAppeals: vi.fn().mockResolvedValue(5) },
      configHistory: { purgeOldEntries: vi.fn().mockResolvedValue(3) },
      economy: { purgeOldTransactions: vi.fn().mockResolvedValue(4) },
      purgeDepartedGuilds: vi.fn().mockResolvedValue([]),
    };
    (container as any).logger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };
    (container as any).valkey = {};
    (container as any).invalidation = { invalidate: vi.fn().mockResolvedValue(undefined) };
    asMock(readClusterShards).mockResolvedValue(fleetReady);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("purges audit, config history and economy transactions, but keeps moderation history by default", async () => {
    await handleDataRetentionFire();

    expect(container.db.audit.purgeOldEntries).toHaveBeenCalledTimes(1);
    expect(container.db.configHistory.purgeOldEntries).toHaveBeenCalledTimes(1);
    expect(container.db.economy.purgeOldTransactions).toHaveBeenCalledTimes(1);
    // MODERATION_RETENTION_DAYS defaults to 0 (keep forever) - neither
    // repository should be touched unless a window is explicitly configured.
    expect(container.db.moderation.purgeOldCases).not.toHaveBeenCalled();
    expect(container.db.appeals.purgeOldAppeals).not.toHaveBeenCalled();
    expect(container.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("0 moderation cases, 0 appeals"),
    );
  });

  it("purges moderation cases and appeals once MODERATION_RETENTION_DAYS is set", async () => {
    process.env.MODERATION_RETENTION_DAYS = "30";

    await handleDataRetentionFire();

    expect(container.db.moderation.purgeOldCases).toHaveBeenCalledTimes(1);
    expect(container.db.appeals.purgeOldAppeals).toHaveBeenCalledTimes(1);

    const [caseDate] = asMock(container.db.moderation.purgeOldCases).mock.calls[0] as [Date];
    const [appealDate] = asMock(container.db.appeals.purgeOldAppeals).mock.calls[0] as [Date];
    const now = Date.now();
    expect(now - caseDate.getTime()).toBeGreaterThan(29 * 86400000);
    expect(now - caseDate.getTime()).toBeLessThan(31 * 86400000);
    expect(appealDate.getTime()).toBe(caseDate.getTime());

    expect(container.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("2 moderation cases, 5 appeals"),
    );
  });

  it("passes AUDIT_ARCHIVE_DIR through to every purge call", async () => {
    process.env.MODERATION_RETENTION_DAYS = "30";
    process.env.AUDIT_ARCHIVE_DIR = "/tmp/lumi-retention-archive";

    await handleDataRetentionFire();

    expect(asMock(container.db.audit.purgeOldEntries).mock.calls[0]?.[1]).toEqual({
      archiveDir: "/tmp/lumi-retention-archive",
    });
    expect(asMock(container.db.configHistory.purgeOldEntries).mock.calls[0]?.[1]).toEqual({
      archiveDir: "/tmp/lumi-retention-archive",
    });
    expect(asMock(container.db.moderation.purgeOldCases).mock.calls[0]?.[1]).toEqual({
      archiveDir: "/tmp/lumi-retention-archive",
    });
    expect(asMock(container.db.appeals.purgeOldAppeals).mock.calls[0]?.[1]).toEqual({
      archiveDir: "/tmp/lumi-retention-archive",
    });
  });

  it("respects the configured retention windows", async () => {
    process.env.CONFIG_HISTORY_RETENTION_DAYS = "10";
    process.env.ECONOMY_TRANSACTION_RETENTION_DAYS = "20";

    await handleDataRetentionFire();

    const [configHistoryDate] = asMock(
      container.db.configHistory.purgeOldEntries,
    ).mock.calls[0] as [Date];
    const [economyDate] = asMock(
      container.db.economy.purgeOldTransactions,
    ).mock.calls[0] as [Date];

    const now = Date.now();
    expect(now - configHistoryDate.getTime()).toBeGreaterThan(9 * 86400000);
    expect(now - configHistoryDate.getTime()).toBeLessThan(11 * 86400000);
    expect(now - economyDate.getTime()).toBeGreaterThan(19 * 86400000);
    expect(now - economyDate.getTime()).toBeLessThan(21 * 86400000);
  });

  it("logs and swallows errors instead of throwing", async () => {
    asMock(container.db.configHistory.purgeOldEntries).mockRejectedValue(
      new Error("db down"),
    );

    await expect(handleDataRetentionFire()).resolves.toBeUndefined();
    expect(container.logger.error).toHaveBeenCalled();
  });

  it("skips the guild purge when the fleet isn't fully reporting, but still runs the other purges", async () => {
    asMock(readClusterShards).mockResolvedValue(fleetNotReady);

    await handleDataRetentionFire();

    expect(container.db.purgeDepartedGuilds).not.toHaveBeenCalled();
    expect(container.db.audit.purgeOldEntries).toHaveBeenCalledTimes(1);
    expect(container.db.configHistory.purgeOldEntries).toHaveBeenCalledTimes(1);
    expect(container.db.economy.purgeOldTransactions).toHaveBeenCalledTimes(1);
    expect(container.logger.debug).toHaveBeenCalled();
  });

  it("purges guilds past the retention cutoff once the fleet is fully ready", async () => {
    asMock(readClusterShards).mockResolvedValue(fleetReady);
    asMock(container.db.purgeDepartedGuilds).mockResolvedValue(["g1", "g2"]);

    await handleDataRetentionFire();

    expect(container.db.purgeDepartedGuilds).toHaveBeenCalledTimes(1);
    const [cutoff] = asMock(container.db.purgeDepartedGuilds).mock.calls[0] as [Date];
    const now = Date.now();
    expect(now - cutoff.getTime()).toBeGreaterThan(29 * 86400000);
    expect(now - cutoff.getTime()).toBeLessThan(31 * 86400000);
    expect(container.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Purged 2 departed guild"),
    );
  });
});
