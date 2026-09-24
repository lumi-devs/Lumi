import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { initMetrics, registry, commandsTotal, cacheHits } from "../src/metrics.js";
import { registerReadinessProbe, runReadinessProbes } from "../src/readiness.js";
import { startTracing, shutdownTracing } from "../src/tracing.js";

describe("Observability package metrics & registry", () => {
  beforeEach(() => {
    initMetrics("test-service");
  });

  it("initializes metrics with default service label", async () => {
    const metricsJson = await registry.getMetricsAsJSON();
    const names = metricsJson.map((m) => m.name);

    // collectDefaultMetrics({ prefix: "lumi_" }) should have registered the
    // standard Node/process metrics into the shared registry.
    expect(names).toContain("lumi_process_cpu_seconds_total");
    expect(names).toContain("lumi_nodejs_heap_size_total_bytes");

    const metricsStr = await registry.metrics();
    expect(metricsStr).toContain('service="test-service"');
  });

  it("increments counters correctly", async () => {
    commandsTotal.inc({ command: "ping", type: "chat", status: "success" });
    cacheHits.inc({ cache: "guild_settings" });

    const metricsStr = await registry.metrics();
    expect(metricsStr).toContain("lumi_commands_total");
    expect(metricsStr).toContain('command="ping"');
    expect(metricsStr).toContain('cache="guild_settings"');
  });
});

describe("Readiness probe timer management", () => {
  it("clears timeout handle when probe resolves successfully", async () => {
    const clearSpy = spyOn(globalThis, "clearTimeout");
    registerReadinessProbe("test-probe-ok", () => ({ status: "ok" }));

    const report = await runReadinessProbes();
    expect(report.checks["test-probe-ok"]?.status).toBe("ok");
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("clears timeout handle when probe throws synchronously", async () => {
    const clearSpy = spyOn(globalThis, "clearTimeout");
    registerReadinessProbe("test-probe-sync-fail", () => {
      throw new Error("sync failure");
    });

    const report = await runReadinessProbes();
    expect(report.checks["test-probe-sync-fail"]?.status).toBe("fail");
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("clears timeout handle when probe rejects asynchronously", async () => {
    const clearSpy = spyOn(globalThis, "clearTimeout");
    registerReadinessProbe("test-probe-async-fail", async () => {
      throw new Error("async failure");
    });

    const report = await runReadinessProbes();
    expect(report.checks["test-probe-async-fail"]?.status).toBe("fail");
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe("Tracing auto-instrumentation unhandledRejection safety", () => {
  const origOtel = process.env["OTEL_ENABLED"];
  const origDiag = process.env["OTEL_DIAG"];

  afterEach(async () => {
    await shutdownTracing();
    if (origOtel === undefined) delete process.env["OTEL_ENABLED"];
    else process.env["OTEL_ENABLED"] = origOtel;

    if (origDiag === undefined) delete process.env["OTEL_DIAG"];
    else process.env["OTEL_DIAG"] = origDiag;
  });

  it("does not emit unhandledRejection when OTEL_ENABLED is true", async () => {
    process.env["OTEL_ENABLED"] = "true";
    process.env["OTEL_DIAG"] = "true";

    let unhandledEmitted = false;
    const unhandledListener = () => {
      unhandledEmitted = true;
    };
    process.on("unhandledRejection", unhandledListener);

    try {
      const started = startTracing({ service: "test-service" });
      expect(started).toBe(true);

      // Allow microtask queue and dynamic import promises to settle
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandledEmitted).toBe(false);
    } finally {
      process.off("unhandledRejection", unhandledListener);
    }
  });
});
