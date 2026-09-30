import { afterEach, describe, expect, it, mock } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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

describe("runCli routing", () => {
  afterEach(() => {
    mock.restore();
  });

  it("prints top-level help and exits 0 for --help", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["--help"]);
      expect(code).toBe(0);
      expect(cap.logs.join("\n")).toContain("Usage: lumi <command>");
    } finally {
      cap.restore();
    }
  });

  it("prints top-level help and exits 2 for no arguments (usage error)", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli([]);
      expect(code).toBe(2);
      expect(cap.logs.join("\n")).toContain("Usage: lumi <command>");
    } finally {
      cap.restore();
    }
  });

  it("prints the version and exits 0 for --version", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["--version"]);
      expect(code).toBe(0);
      expect(cap.logs.join("\n")).toMatch(/^\d+\.\d+\.\d+$/m);
    } finally {
      cap.restore();
    }
  });

  it("exits 2 with an error for an unknown command", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["not-a-real-command"]);
      expect(code).toBe(2);
      expect(cap.errors.join("\n")).toContain('Unknown command "not-a-real-command"');
    } finally {
      cap.restore();
    }
  });

  it("routes to the config command and passes its own argv through untouched", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["config", "--help"]);
      expect(code).toBe(0);
      expect(cap.logs.join("\n")).toContain("Usage: lumi config");
    } finally {
      cap.restore();
    }
  });

  it("routes to the module command's list subcommand help", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["module", "--help"]);
      expect(code).toBe(0);
      expect(cap.logs.join("\n")).toContain("Usage: lumi module list");
    } finally {
      cap.restore();
    }
  });

  it("does not let an undeclared subcommand flag get misparsed at the top level", async () => {
    // Regression: a naive top-level `parseArgs` over the *whole* argv would
    // treat an unknown `--dir` as a boolean flag and swallow its value
    // (the actual target directory) as a stray positional instead, before
    // `addon create` ever sees either token correctly.
    const cap = captureConsole();
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-cli-test-"));
    try {
      const code = await runCli([
        "addon",
        "create",
        "routing-test",
        "--dir",
        path.join(scratch, "addons"),
      ]);
      expect(code).toBe(0);
      const created = await fs.readdir(path.join(scratch, "addons", "routing-test"));
      expect(created).toContain("info.json");
      expect(created).toContain("index.ts");
    } finally {
      cap.restore();
      await fs.rm(scratch, { recursive: true, force: true });
    }
  });
});
