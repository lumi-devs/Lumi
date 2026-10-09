import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { DoctorCheckResult } from "@lumi/core/doctor";

let results: DoctorCheckResult[] = [];

void mock.module("@lumi/core/doctor", () => ({
  runDoctor: () => Promise.resolve(results),
  formatDoctorReport: (rows: DoctorCheckResult[], { json }: { json: boolean }) =>
    json ? JSON.stringify(rows) : rows.map((r) => `${r.status} ${r.name}`).join("\n"),
  doctorExitCode: (rows: DoctorCheckResult[]) => (rows.some((r) => r.status === "fail") ? 1 : 0),
}));

const { runCli } = await import("../src/main.js");

describe("lumi doctor", () => {
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    logs = [];
    errors = [];
    spyOn(console, "log").mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
    spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(args.join(" ")));
  });

  afterEach(() => {
    mock.restore();
  });

  it("prints help and exits 0", async () => {
    expect(await runCli(["doctor", "--help"])).toBe(0);
    expect(logs.join("\n")).toContain("Usage: lumi doctor");
  });

  it("prints the report and exits 0 when nothing fails", async () => {
    results = [
      { name: "postgres", status: "ok", detail: "" },
      { name: "valkey", status: "warn", detail: "old" },
    ];
    expect(await runCli(["doctor"])).toBe(0);
    expect(logs.join("\n")).toBe("ok postgres\nwarn valkey");
  });

  it("exits 1 when a check fails", async () => {
    results = [{ name: "discord-token", status: "fail", detail: "401" }];
    expect(await runCli(["doctor"])).toBe(1);
  });

  it("emits JSON with --json", async () => {
    results = [{ name: "valkey", status: "ok", detail: "" }];
    expect(await runCli(["doctor", "--json"])).toBe(0);
    expect(JSON.parse(logs.join("\n"))).toEqual(results);
  });

  it("exits 2 on unexpected positional arguments", async () => {
    expect(await runCli(["doctor", "invalid"])).toBe(2);
    expect(errors.join("\n")).toContain("Usage: lumi doctor");
  });
});
