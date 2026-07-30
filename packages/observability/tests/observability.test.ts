import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initMetrics, registry, commandsTotal, cacheHits } from "../src/metrics.js";

describe("Observability package metrics & registry", () => {
  beforeEach(() => {
    initMetrics("test-service");
  });

  it("initializes metrics with default service label", () => {
    expect(registry).toBeDefined();
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
