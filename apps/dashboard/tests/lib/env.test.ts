import { describe, it, expect, afterEach } from "bun:test";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

// `#/lib/env` computes everything at module-load time, so each test needs a
// fresh evaluation under its own env — bun:test has no `vi.resetModules`, but
// a distinct query string makes Bun's loader treat it as a new module anyway.
function importEnv() {
  return import(`#/lib/env?t=${Math.random()}`);
}

// @types/node (via Next.js's global augmentation) marks NODE_ENV readonly.
function setNodeEnv(value: string) {
  (process.env as Record<string, string>)["NODE_ENV"] = value;
}

describe("env RPC_INTERNAL_TOKEN", () => {
  it("refuses to boot in production without RPC_INTERNAL_TOKEN", async () => {
    setNodeEnv("production");
    delete process.env["NEXT_PHASE"];
    delete process.env["RPC_INTERNAL_TOKEN"];

    await expect(importEnv()).rejects.toThrow("Missing: RPC_INTERNAL_TOKEN");
  });

  it("boots with an empty token outside production (dev/build)", async () => {
    setNodeEnv("development");
    delete process.env["RPC_INTERNAL_TOKEN"];

    const { env } = await importEnv();
    expect(env.rpcInternalToken).toBe("");
  });

  it("uses the provided token in production", async () => {
    setNodeEnv("production");
    delete process.env["NEXT_PHASE"];
    process.env["RPC_INTERNAL_TOKEN"] = "s3cret";
    process.env["DASHBOARD_SESSION_SECRET"] = "a".repeat(32);

    const { env } = await importEnv();
    expect(env.rpcInternalToken).toBe("s3cret");
  });
});
