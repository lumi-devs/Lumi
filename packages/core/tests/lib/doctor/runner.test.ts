import { describe, it, expect } from "bun:test";
import { runDoctor } from "@lumi/lib/doctor/runner.js";
import type { DoctorCheckResult } from "@lumi/lib/doctor/types.js";

function ok(name: string): Promise<DoctorCheckResult> {
  return Promise.resolve({ name, status: "ok", detail: "fine" });
}

describe("runDoctor", () => {
  it("runs every provided check and returns results in order", async () => {
    const results = await runDoctor({
      checks: [() => ok("a"), () => ok("b"), () => ok("c")],
    });
    expect(results.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });

  it("runs checks concurrently, not sequentially", async () => {
    const start = performance.now();
    const slow = (name: string) =>
      new Promise<DoctorCheckResult>((resolve) =>
        setTimeout(() => resolve({ name, status: "ok", detail: "fine" }), 50),
      );
    await runDoctor({ checks: [() => slow("a"), () => slow("b"), () => slow("c")] });
    expect(performance.now() - start).toBeLessThan(140);
  });

  it("times out a hanging check instead of hanging the whole run", async () => {
    const results = await runDoctor({
      checks: [() => new Promise<DoctorCheckResult>(() => undefined)],
      globalTimeoutMs: 20,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.detail).toMatch(/timed out/);
  });
});
