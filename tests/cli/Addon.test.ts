import { afterEach, describe, expect, it, mock } from "bun:test";
import { runCli } from "#src/cli/Main.js";

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = mock((...args: unknown[]) => void logs.push(args.join(" ")));
  console.error = mock((...args: unknown[]) => void errors.push(args.join(" ")));
  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

describe("lumi addon", () => {
  afterEach(() => {
    mock.restore();
  });

  it("prints top-level addon help and exits 0", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "--help"])).toBe(0);
      expect(cap.logs.join("\n")).toContain("Usage: lumi addon <create|validate>");
    } finally {
      cap.restore();
    }
  });

  it("exits 2 for an unknown addon subcommand", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "bogus"])).toBe(2);
      expect(cap.errors.join("\n")).toContain('Unknown addon subcommand "bogus"');
    } finally {
      cap.restore();
    }
  });

  it("exits 2 for removed test/dev subcommands", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "test", "whatever"])).toBe(2);
      expect(await runCli(["addon", "dev", "whatever"])).toBe(2);
    } finally {
      cap.restore();
    }
  });

  it("exits 2 when validating a directory with no addons", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "validate", "/definitely/not/here"])).toBe(2);
    } finally {
      cap.restore();
    }
  });
});
