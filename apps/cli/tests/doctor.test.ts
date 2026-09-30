import { afterEach, describe, expect, it, mock } from "bun:test";
import { runCli } from "../src/main.js";

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = mock((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  const errorSpy = mock((...args: unknown[]) => {
    errors.push(args.join(" "));
  });
  const originalLog = console.log;
  const originalError = console.error;
  console.log = logSpy;
  console.error = errorSpy;
  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

describe("doctor command", () => {
  afterEach(() => {
    mock.restore();
  });

  it("prints help and exits 0 for --help", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["doctor", "--help"]);
      expect(code).toBe(0);
      expect(cap.logs.join("\n")).toContain("Usage: lumi doctor");
    } finally {
      cap.restore();
    }
  });

  it("runs doctor checks with human-readable output", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["doctor"]);
      const output = cap.logs.join("\n");
      // Output should contain check results with status glyphs (✓, ⚠, ✗, –)
      expect(output).toMatch(/[✓⚠✗–]/);
      // Exit code should be 0 (no failures) or 1 (some failures) based on actual checks
      expect([0, 1]).toContain(code);
    } finally {
      cap.restore();
    }
  });

  it("runs doctor checks with JSON output for --json", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["doctor", "--json"]);
      const output = cap.logs.join("\n");
      // Output should be valid JSON
      const json = JSON.parse(output);
      expect(Array.isArray(json)).toBe(true);
      if (json.length > 0) {
        expect(json[0]).toHaveProperty("name");
        expect(json[0]).toHaveProperty("status");
        expect(json[0]).toHaveProperty("detail");
      }
      // Exit code should be 0 (no failures) or 1 (some failures) based on actual checks
      expect([0, 1]).toContain(code);
    } finally {
      cap.restore();
    }
  });

  it("exits 2 for unexpected positional arguments", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["doctor", "invalid"]);
      expect(code).toBe(2);
      expect(cap.errors.join("\n")).toContain("Usage: lumi doctor");
    } finally {
      cap.restore();
    }
  });
});
