import { afterEach, describe, expect, it, mock } from "bun:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/main.js";

const HelloWorld = fileURLToPath(
  new URL("../../../packages/core/tests/fixtures/addons/hello-world", import.meta.url),
);
const NoSuchAddon = fileURLToPath(new URL("../../../packages/core/tests/fixtures/addons/no-such-addon", import.meta.url));

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
      expect(cap.logs.join("\n")).toContain("Usage: lumi addon <create|validate|test|dev>");
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
});

describe("lumi addon test", () => {
  afterEach(() => {
    mock.restore();
  });

  it("prints help and exits 0", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "test", "--help"])).toBe(0);
      expect(cap.logs.join("\n")).toContain("Usage: lumi addon test <dir>");
    } finally {
      cap.restore();
    }
  });

  it("exits 2 with no directory argument", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "test"])).toBe(2);
      expect(cap.errors.join("\n")).toContain("Usage: lumi addon test <dir>");
    } finally {
      cap.restore();
    }
  });

  it("exits 2 for an invalid --timeout", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "test", HelloWorld, "--timeout", "not-a-number"])).toBe(2);
      expect(cap.errors.join("\n")).toContain("Invalid --timeout");
    } finally {
      cap.restore();
    }
  });

  it("exits 2 for an unknown option", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "test", HelloWorld, "--bogus"])).toBe(2);
    } finally {
      cap.restore();
    }
  });

  it("loads the hello-world fixture and reports its commands", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["addon", "test", HelloWorld]);
      expect(code).toBe(0);
      const out = cap.logs.join("\n");
      expect(out).toContain(`loaded "hello-world"`);
      expect(out).toContain("commands: hello");
      expect(out).toContain("interaction prefixes: (none)");
      expect(out).toContain("tasks: (none)");
    } finally {
      cap.restore();
    }
  }, 30_000);

  it("invokes a command and reports the RPC calls it made", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["addon", "test", HelloWorld, "--invoke", "hello"]);
      expect(code).toBe(0);
      const out = cap.logs.join("\n");
      expect(out).toContain('invoked "hello"; RPC calls made:');
      expect(out).toContain("config.get");
      expect(out).toContain("ctx.reply");
    } finally {
      cap.restore();
    }
  }, 30_000);

  it("exits 1 when asked to invoke a command the addon does not have", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["addon", "test", HelloWorld, "--invoke", "does-not-exist"]);
      expect(code).toBe(1);
      expect(cap.errors.join("\n")).toContain('No command "does-not-exist"');
    } finally {
      cap.restore();
    }
  }, 30_000);

  it("exits 1 when the addon directory does not exist", async () => {
    const cap = captureConsole();
    try {
      const code = await runCli(["addon", "test", NoSuchAddon]);
      expect(code).toBe(1);
    } finally {
      cap.restore();
    }
  }, 30_000);
});

describe("lumi addon dev", () => {
  afterEach(() => {
    mock.restore();
  });

  it("prints help and exits 0", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "dev", "--help"])).toBe(0);
      expect(cap.logs.join("\n")).toContain("Usage: lumi addon dev <dir>");
    } finally {
      cap.restore();
    }
  });

  it("exits 2 with no directory argument", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "dev"])).toBe(2);
      expect(cap.errors.join("\n")).toContain("Usage: lumi addon dev <dir>");
    } finally {
      cap.restore();
    }
  });

  it("exits 2 when the directory does not exist", async () => {
    const cap = captureConsole();
    try {
      expect(await runCli(["addon", "dev", NoSuchAddon])).toBe(2);
      expect(cap.errors.join("\n")).toContain("is not a directory");
    } finally {
      cap.restore();
    }
  });
});
