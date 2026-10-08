import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { container } from "#lib/services.js";

vi.mock("#lib/gdpr.js", () => ({
  executeGdprExport: vi.fn(),
}));

import { executeGdprExport } from "#lib/gdpr.js";
import {
  handleGdprExportCleanupFire,
  handleGdprExportFire,
} from "#modules/core/services/gdpr-export-task.js";

// bun:test has no `vi.mocked` type-narrowing helper - these fields are real
// functions at the type level, stubbed with vi.fn() at runtime.
function asMock<T extends (...args: any[]) => any>(fn: T): Mock<T> {
  return fn as unknown as Mock<T>;
}

const USER_ID = "111111111111111111";

function mockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe("handleGdprExportFire", () => {
  let dir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lumi-gdpr-export-"));
    process.env["GDPR_EXPORT_DIR"] = dir;
    process.env["GDPR_EXPORT_TTL_HOURS"] = "24";
    container.logger = mockLogger() as any;
    asMock(executeGdprExport).mockReset();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a gzipped JSON export and marks the job done", async () => {
    asMock(executeGdprExport).mockResolvedValue({ core: { foo: "bar" } });
    const markRunning = vi.fn().mockResolvedValue(undefined);
    const markDone = vi.fn().mockResolvedValue(undefined);
    (container as any).db = {
      gdprExportJobs: {
        findById: vi.fn().mockResolvedValue({ id: "job-1", userId: USER_ID }),
        markRunning,
        markDone,
        markFailed: vi.fn(),
      },
    };

    await handleGdprExportFire(container, { jobId: "job-1" });

    expect(markRunning).toHaveBeenCalledWith("job-1");
    expect(markDone).toHaveBeenCalledTimes(1);
    const [, doneArgs] = markDone.mock.calls[0]!;
    expect(doneArgs.filePath).toBe(path.join(dir, "job-1.json.gz"));
    expect(doneArgs.sizeBytes).toBeGreaterThan(0);
    expect(doneArgs.expiresAt).toBeInstanceOf(Date);

    const raw = await readFile(doneArgs.filePath);
    const json = JSON.parse(gunzipSync(raw).toString("utf8"));
    expect(json).toEqual({ core: { foo: "bar" } });
  });

  it("marks the job failed when the export builder throws", async () => {
    asMock(executeGdprExport).mockRejectedValue(new Error("boom"));
    const markFailed = vi.fn().mockResolvedValue(undefined);
    (container as any).db = {
      gdprExportJobs: {
        findById: vi.fn().mockResolvedValue({ id: "job-2", userId: USER_ID }),
        markRunning: vi.fn().mockResolvedValue(undefined),
        markDone: vi.fn(),
        markFailed,
      },
    };

    await handleGdprExportFire(container, { jobId: "job-2" });

    expect(markFailed).toHaveBeenCalledWith("job-2", "boom");
  });

  it("skips (without erroring) when the job row is missing", async () => {
    (container as any).db = {
      gdprExportJobs: {
        findById: vi.fn().mockResolvedValue(null),
        markRunning: vi.fn(),
        markDone: vi.fn(),
        markFailed: vi.fn(),
      },
    };

    await handleGdprExportFire(container, { jobId: "missing" });

    expect(container.db.gdprExportJobs.markRunning).not.toHaveBeenCalled();
    expect(container.logger.warn).toHaveBeenCalled();
  });
});

describe("handleGdprExportCleanupFire", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lumi-gdpr-cleanup-"));
    container.logger = mockLogger() as any;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("removes expired files and deletes their job rows", async () => {
    const filePath = path.join(dir, "expired.json.gz");
    await Bun.write(filePath, "stub");

    const deleteByIds = vi.fn().mockResolvedValue(1);
    (container as any).db = {
      gdprExportJobs: {
        findExpired: vi.fn().mockResolvedValue([
          { id: "job-1", filePath, userId: USER_ID },
        ]),
        deleteByIds,
      },
    };

    await handleGdprExportCleanupFire(container);

    expect(deleteByIds).toHaveBeenCalledWith(["job-1"]);
    await expect(readFile(filePath)).rejects.toThrow();
  });

  it("does nothing when no jobs are expired", async () => {
    const deleteByIds = vi.fn();
    (container as any).db = {
      gdprExportJobs: {
        findExpired: vi.fn().mockResolvedValue([]),
        deleteByIds,
      },
    };

    await handleGdprExportCleanupFire(container);

    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it("still deletes the row when the file is already gone", async () => {
    const missingPath = path.join(dir, "already-gone.json.gz");
    const deleteByIds = vi.fn().mockResolvedValue(1);
    (container as any).db = {
      gdprExportJobs: {
        findExpired: vi.fn().mockResolvedValue([
          { id: "job-2", filePath: missingPath, userId: USER_ID },
        ]),
        deleteByIds,
      },
    };

    await handleGdprExportCleanupFire(container);

    expect(deleteByIds).toHaveBeenCalledWith(["job-2"]);
  });
});
