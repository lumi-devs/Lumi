import { describe, it, expect, afterEach, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("env RPC_INTERNAL_TOKEN", () => {
  it("refuses to boot in production without RPC_INTERNAL_TOKEN", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env["NEXT_PHASE"];
    delete process.env["RPC_INTERNAL_TOKEN"];

    await expect(import("#/lib/env")).rejects.toThrow(
      "Missing: RPC_INTERNAL_TOKEN",
    );
  });

  it("boots with an empty token outside production (dev/build)", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    delete process.env["RPC_INTERNAL_TOKEN"];

    const { env } = await import("#/lib/env");
    expect(env.rpcInternalToken).toBe("");
  });

  it("uses the provided token in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env["NEXT_PHASE"];
    process.env["RPC_INTERNAL_TOKEN"] = "s3cret";
    process.env["DASHBOARD_SESSION_SECRET"] = "a".repeat(32);

    const { env } = await import("#/lib/env");
    expect(env.rpcInternalToken).toBe("s3cret");
  });
});
