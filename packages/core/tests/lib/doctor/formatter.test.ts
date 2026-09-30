import { describe, it, expect } from "bun:test";
import { formatDoctorReport, doctorExitCode } from "#lib/doctor/formatter.js";
import type { DoctorCheckResult } from "#lib/doctor/types.js";

const results: DoctorCheckResult[] = [
  { name: "a", status: "ok", detail: "all good" },
  { name: "b", status: "warn", detail: "hmm", hint: "check it" },
  { name: "c", status: "fail", detail: "broken" },
  { name: "d", status: "skip", detail: "not configured" },
];

describe("formatDoctorReport", () => {
  it("renders one glyph-prefixed line per check", () => {
    const text = formatDoctorReport(results);
    const lines = text.split("\n").filter((l) => !l.startsWith("  hint:"));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("✓ a: all good");
    expect(lines[1]).toBe("⚠ b: hmm");
    expect(lines[2]).toBe("✗ c: broken");
    expect(lines[3]).toBe("– d: not configured");
  });

  it("includes a hint line when present", () => {
    const text = formatDoctorReport(results);
    expect(text).toMatch(/hint: check it/);
  });

  it("renders JSON when requested", () => {
    const text = formatDoctorReport(results, { json: true });
    expect(JSON.parse(text)).toEqual(results);
  });
});

describe("doctorExitCode", () => {
  it("is 0 when nothing failed", () => {
    expect(doctorExitCode(results.filter((r) => r.status !== "fail"))).toBe(0);
  });

  it("is 1 when anything failed", () => {
    expect(doctorExitCode(results)).toBe(1);
  });
});
