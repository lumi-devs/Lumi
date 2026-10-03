import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { container } from "@sapphire/framework";
import { dbQueryDuration, dbSlowQueriesTotal } from "@lumi/observability";
import { recordQueryMetrics } from "#lib/prisma/query-metrics.js";

// DB_SLOW_QUERY_THRESHOLD_MS is read once at module load (see
// #lib/prisma/query-metrics.js), so these tests exercise the documented
// default (1000ms) rather than reconfiguring it per test.

describe("recordQueryMetrics", () => {
  let observeSpy: ReturnType<typeof spyOn>;
  let incSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn<any, "warn">>;

  beforeEach(() => {
    observeSpy = spyOn(dbQueryDuration, "observe").mockImplementation(() => {});
    incSpy = spyOn(dbSlowQueriesTotal, "inc").mockImplementation(() => {});
    container.logger = {
      warn: () => {},
      error: () => {},
      info: () => {},
      debug: () => {},
    } as any;
    warnSpy = spyOn(container.logger, "warn");
  });

  afterEach(() => {
    observeSpy.mockRestore();
    incSpy.mockRestore();
  });

  it("records duration with model/operation labels", () => {
    recordQueryMetrics("Guild", "findUnique", 12);

    expect(observeSpy).toHaveBeenCalledWith(
      { model: "Guild", operation: "findUnique" },
      0.012,
    );
  });

  it("does not flag a query below the default 1000ms threshold", () => {
    recordQueryMetrics("Guild", "update", 999);

    expect(incSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("buckets raw queries (undefined model) under 'raw'", () => {
    recordQueryMetrics(undefined, "queryRaw", 5);

    expect(observeSpy).toHaveBeenCalledWith(
      { model: "raw", operation: "queryRaw" },
      0.005,
    );
  });

  it("increments the slow-query counter and logs above the default threshold", () => {
    recordQueryMetrics("ModerationCase", "update", 1500);

    expect(incSpy).toHaveBeenCalledWith({
      model: "ModerationCase",
      operation: "update",
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("ModerationCase.update");
  });
});
