import { describe, expect, it } from "vitest";
import {
  applyProgress,
  cancelJobStatus,
  isRunnableJob,
  isTerminalJob,
  nextBatch,
  nextJobStatus,
  progressBar,
  progressPercent,
  resumeJobStatus,
  type BulkJobProgress,
} from "../worker-logic.js";

const job: BulkJobProgress = {
  status: "running",
  total: 10,
  processed: 4,
  failed: 1,
};

describe("bulk role job resume logic", () => {
  it("resumes only paused jobs", () => {
    expect(resumeJobStatus("paused")).toBe("pending");
    expect(resumeJobStatus("running")).toBe("running");
    expect(resumeJobStatus("cancelled")).toBe("cancelled");
  });

  it("cancels any non-terminal job", () => {
    expect(cancelJobStatus("pending")).toBe("cancelled");
    expect(cancelJobStatus("running")).toBe("cancelled");
    expect(cancelJobStatus("paused")).toBe("cancelled");
    expect(cancelJobStatus("completed")).toBe("completed");
    expect(cancelJobStatus("failed")).toBe("failed");
  });

  it("runs pending and running jobs only", () => {
    expect(isRunnableJob("pending")).toBe(true);
    expect(isRunnableJob("running")).toBe(true);
    expect(isRunnableJob("paused")).toBe(false);
    expect(isRunnableJob("cancelled")).toBe(false);
    expect(isTerminalJob("completed")).toBe(true);
  });
});

describe("bulk role job progress", () => {
  it("keeps a job pending while work remains", () => {
    expect(
      nextJobStatus({ status: "running", remaining: 3, failed: 0, total: 10 }),
    ).toBe("pending");
  });

  it("completes a job with no remaining work", () => {
    expect(
      nextJobStatus({ status: "running", remaining: 0, failed: 2, total: 10 }),
    ).toBe("completed");
  });

  it("fails a job when every member failed", () => {
    expect(
      nextJobStatus({ status: "running", remaining: 0, failed: 10, total: 10 }),
    ).toBe("failed");
  });

  it("never revives a cancelled job", () => {
    expect(
      nextJobStatus({
        status: "cancelled",
        remaining: 0,
        failed: 0,
        total: 10,
      }),
    ).toBe("cancelled");
  });

  it("accumulates progress and caps processed at total", () => {
    expect(applyProgress(job, 3, 1)).toEqual({
      status: "running",
      total: 10,
      processed: 7,
      failed: 2,
    });
    expect(applyProgress(job, 50, 0).processed).toBe(10);
  });

  it("renders progress percentages and bars", () => {
    expect(progressPercent(job)).toBe(40);
    expect(progressBar(job, 10)).toBe("████░░░░░░");
    expect(progressPercent({ ...job, total: 0 })).toBe(100);
  });

  it("returns the next batch and remaining count", () => {
    expect(nextBatch([1, 2, 3, 4], 2)).toEqual({
      batch: [1, 2],
      remaining: 2,
    });
    expect(nextBatch([1], 0)).toEqual({ batch: [1], remaining: 0 });
  });
});
