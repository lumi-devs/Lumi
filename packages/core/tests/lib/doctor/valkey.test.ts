import { describe, it, expect } from "bun:test";
import { checkValkey } from "#lib/doctor/checks/valkey.js";

describe("checkValkey", () => {
  it("fails when PING fails", async () => {
    const result = await checkValkey({
      getClient: () => ({
        ping: () => Promise.reject(new Error("ECONNREFUSED")),
        info: () => Promise.resolve(""),
        quit: () => Promise.resolve(),
      }),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/PING/);
  });

  it("warns when PING succeeds but INFO fails", async () => {
    const result = await checkValkey({
      getClient: () => ({
        ping: () => Promise.resolve("PONG"),
        info: () => Promise.reject(new Error("NOPERM")),
        quit: () => Promise.resolve(),
      }),
    });
    expect(result.status).toBe("warn");
  });

  it("reports the Valkey version on success", async () => {
    const result = await checkValkey({
      getClient: () => ({
        ping: () => Promise.resolve("PONG"),
        info: () => Promise.resolve("valkey_version:9.0.5\r\nuptime_in_seconds:10\r\n"),
        quit: () => Promise.resolve(),
      }),
    });
    expect(result.status).toBe("ok");
    expect(result.detail).toMatch(/9\.0\.5/);
  });
});
