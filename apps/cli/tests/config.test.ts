import { describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverEnvKeys, redactValue } from "../src/commands/config.js";

describe("redactValue", () => {
  it("redacts values whose key name looks secret-ish", () => {
    expect(redactValue("BOT_TOKEN", "abc.def.ghi")).toBe("***redacted***");
    expect(redactValue("RPC_INTERNAL_TOKEN", "xyz")).toBe("***redacted***");
    expect(redactValue("DASHBOARD_SESSION_SECRET", "xyz")).toBe("***redacted***");
    expect(redactValue("POSTGRES_PASSWORD", "xyz")).toBe("***redacted***");
    expect(redactValue("ADDON_ALLOWED_SIGNERS_FILE", "/etc/signers")).toBe("/etc/signers");
  });

  it("redacts only the embedded credentials of a URL, keeping the rest visible", () => {
    const redacted = redactValue(
      "POSTGRES_URL",
      "postgresql://lumi:hunter2@localhost:5432/lumi",
    );
    expect(redacted).toBe("postgresql://***:***@localhost:5432/lumi");
  });

  it("leaves a credential-free URL untouched", () => {
    expect(redactValue("DASHBOARD_PUBLIC_URL", "https://lumi.example.com")).toBe(
      "https://lumi.example.com",
    );
  });

  it("leaves an ordinary non-secret value untouched", () => {
    expect(redactValue("NODE_ENV", "production")).toBe("production");
  });
});

describe("discoverEnvKeys", () => {
  it("finds direct process.env[...] reads and the envParse* helper keys", async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-cli-env-"));
    const file = path.join(scratch, "env.ts");
    await fs.writeFile(
      file,
      [
        'export const getBotToken = () => envParseString("BOT_TOKEN");',
        'export const getPort = () => envParseInteger("PORT", 8080);',
        'export const getHost = () => process.env["HOST"];',
        "// duplicate reference should only be counted once",
        'export const getHostAgain = () => process.env["HOST"];',
      ].join("\n"),
    );
    try {
      const keys = await discoverEnvKeys(file);
      expect(keys).toEqual(["BOT_TOKEN", "HOST", "PORT"]);
    } finally {
      await fs.rm(scratch, { recursive: true, force: true });
    }
  });
});
