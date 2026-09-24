import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { Collection } from "discord.js";
import {
  loadBackupConfig,
  createBackup,
  flagRestorePending,
  isRestorePending,
} from "#modules/security/services/backup.js";

function setContainer(overrides: {
  redis?: Record<string, unknown>;
  db?: Record<string, unknown>;
}) {
  (container as any).redis = {
    set: vi.fn(),
    exists: vi.fn().mockResolvedValue(0),
    ...overrides.redis,
  };
  (container as any).db = {
    ...overrides.db,
  };
  (container as any).logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadBackupConfig", () => {
  it("parses config with defaults", async () => {
    const getAllModuleConfig = vi.fn().mockResolvedValue({});
    setContainer({ db: { config: { getAllModuleConfig } } });

    const config = await loadBackupConfig("g1");

    expect(config).toEqual({ intervalHours: 3, keepCount: 10 });
  });

  it("reads configured values", async () => {
    const getAllModuleConfig = vi.fn().mockResolvedValue({
      backup_interval_hours: 6,
      backup_keep_count: 5,
    });
    setContainer({ db: { config: { getAllModuleConfig } } });

    const config = await loadBackupConfig("g1");

    expect(config).toEqual({ intervalHours: 6, keepCount: 5 });
  });
});

describe("createBackup", () => {
  it("snapshots the guild and prunes old backups past keepCount", async () => {
    const createBackupDb = vi.fn().mockResolvedValue({ id: 42 });
    const pruneBackups = vi.fn().mockResolvedValue(undefined);
    setContainer({
      db: { security: { createBackup: createBackupDb, pruneBackups } },
    });
    const guild = {
      id: "g1",
      roles: { cache: new Collection() },
      channels: { cache: new Collection() },
    } as any;

    const id = await createBackup(guild, 10);

    expect(createBackupDb).toHaveBeenCalledWith("g1", expect.any(Object));
    expect(pruneBackups).toHaveBeenCalledWith("g1", 10);
    expect(id).toBe(42);
  });
});

describe("flagRestorePending / isRestorePending", () => {
  it("flags restore pending with a 24h expiry", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    setContainer({ redis: { set } });

    await flagRestorePending("g1");

    expect(set).toHaveBeenCalledWith(
      expect.stringContaining("g1"),
      "1",
      "EX",
      24 * 60 * 60,
    );
  });

  it("reports pending state from redis", async () => {
    const exists = vi.fn().mockResolvedValue(1);
    setContainer({ redis: { exists } });

    const result = await isRestorePending("g1");

    expect(result).toBe(true);
  });
});
