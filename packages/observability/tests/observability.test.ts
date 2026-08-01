import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initMetrics, registry, commandsTotal, cacheHits } from "../src/metrics.js";

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
