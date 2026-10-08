import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "#lib/services.js";

vi.mock("#lib/scheduler/schedule.js", () => ({
  scheduleTask: vi.fn().mockResolvedValue(undefined),
  QueuePriority: { CRITICAL: 1, UTILITY: 5, CLEANUP: 10 },
}));

import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { scheduleTask } from "#lib/scheduler/schedule.js";

const SELF_ID = "111111111111111111";
const OTHER_USER_ID = "222222222222222222";
const BOT_OWNER_ID = "333333333333333333";

describe("global.gdpr.export.start / global.gdpr.export.status", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["RPC_INTERNAL_TOKEN"] = "test-rpc-internal-token";

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    // No bot-owner application configured by default - only SELF_ID can act on its own data.
    container.client = { application: null } as any;

    registerRpcHandlers();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function callStart(actorId: string, userId: string) {
    const handler = getRpcHandler("global.gdpr.export.start");
    if (!handler) throw new Error("global.gdpr.export.start not registered");
    return handler({
      id: "req",
      action: "global.gdpr.export.start",
      actorId,
      data: { userId },
    });
  }

  function callStatus(actorId: string, jobId: string) {
    const handler = getRpcHandler("global.gdpr.export.status");
    if (!handler) throw new Error("global.gdpr.export.status not registered");
    return handler({
      id: "req",
      action: "global.gdpr.export.status",
      actorId,
      data: { jobId },
    });
  }

  describe("start", () => {
    it("creates a job and schedules the export task for one's own data", async () => {
      const created = { id: "job-1" };
      (container as any).db = {
        gdprExportJobs: { create: vi.fn().mockResolvedValue(created) },
      };

      const result = (await callStart(SELF_ID, SELF_ID)) as { jobId: string };

      expect(result).toEqual({ jobId: "job-1" });
      expect(container.db.gdprExportJobs.create).toHaveBeenCalledWith({
        userId: SELF_ID,
        requestedBy: SELF_ID,
      });
      expect(scheduleTask).toHaveBeenCalledWith(
        "gdpr-export",
        { jobId: "job-1" },
        expect.objectContaining({ customJobOptions: expect.any(Object) }),
      );
    });

    it("rejects exporting another user's data without bot-owner authorization", async () => {
      (container as any).db = {
        gdprExportJobs: { create: vi.fn() },
      };

      await expect(callStart(SELF_ID, OTHER_USER_ID)).rejects.toThrow(
        /Not authorized/,
      );
      expect(container.db.gdprExportJobs.create).not.toHaveBeenCalled();
    });

    it("allows the bot owner to start an export for another user", async () => {
      container.client = { application: { owner: { id: BOT_OWNER_ID } } } as any;
      const created = { id: "job-2" };
      (container as any).db = {
        gdprExportJobs: { create: vi.fn().mockResolvedValue(created) },
      };

      const result = (await callStart(BOT_OWNER_ID, OTHER_USER_ID)) as {
        jobId: string;
      };

      expect(result).toEqual({ jobId: "job-2" });
    });
  });

  describe("status", () => {
    it("throws when the job does not exist", async () => {
      (container as any).db = {
        gdprExportJobs: { findById: vi.fn().mockResolvedValue(null) },
      };

      await expect(callStatus(SELF_ID, "missing")).rejects.toThrow(
        /not found/i,
      );
    });

    it("rejects viewing someone else's job without bot-owner authorization", async () => {
      (container as any).db = {
        gdprExportJobs: {
          findById: vi.fn().mockResolvedValue({
            id: "job-1",
            userId: OTHER_USER_ID,
            status: "pending",
            createdAt: new Date(),
          }),
        },
      };

      await expect(callStatus(SELF_ID, "job-1")).rejects.toThrow(
        /Not authorized/,
      );
    });

    it("returns status with no download token while pending", async () => {
      (container as any).db = {
        gdprExportJobs: {
          findById: vi.fn().mockResolvedValue({
            id: "job-1",
            userId: SELF_ID,
            status: "pending",
            error: null,
            sizeBytes: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            completedAt: null,
            expiresAt: null,
          }),
        },
      };

      const result = (await callStatus(SELF_ID, "job-1")) as Record<
        string,
        unknown
      >;

      expect(result["status"]).toBe("pending");
      expect(result["download"]).toBeUndefined();
    });

    it("returns a signed download token once the job is done and unexpired", async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      (container as any).db = {
        gdprExportJobs: {
          findById: vi.fn().mockResolvedValue({
            id: "job-1",
            userId: SELF_ID,
            status: "done",
            error: null,
            sizeBytes: 1234,
            filePath: "/data/gdpr-exports/job-1.json.gz",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            completedAt: new Date("2026-01-01T00:01:00.000Z"),
            expiresAt,
          }),
        },
      };

      const result = (await callStatus(SELF_ID, "job-1")) as {
        status: string;
        download?: { token: string; expiresAt: string };
      };

      expect(result.status).toBe("done");
      expect(result.download?.token).toEqual(expect.any(String));
      expect(result.download?.token.split(".")).toHaveLength(3);
      expect(result.download?.expiresAt).toBe(expiresAt.toISOString());
    });

    it("omits the download token once the job's expiry has already passed", async () => {
      (container as any).db = {
        gdprExportJobs: {
          findById: vi.fn().mockResolvedValue({
            id: "job-1",
            userId: SELF_ID,
            status: "done",
            error: null,
            sizeBytes: 1234,
            filePath: "/data/gdpr-exports/job-1.json.gz",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            completedAt: new Date("2026-01-01T00:01:00.000Z"),
            expiresAt: new Date(Date.now() - 1_000),
          }),
        },
      };

      const result = (await callStatus(SELF_ID, "job-1")) as Record<
        string,
        unknown
      >;

      expect(result["download"]).toBeUndefined();
    });
  });
});
