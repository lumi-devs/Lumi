import { describe, it, expect } from "bun:test";
import { checkRedis } from "#lib/doctor/checks/redis.js";

describe("checkRedis", () => {
  it("fails when PING fails", async () => {
    const result = await checkRedis({
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
    const result = await checkRedis({
      getClient: () => ({
        ping: () => Promise.resolve("PONG"),
        info: () => Promise.reject(new Error("NOPERM")),
        quit: () => Promise.resolve(),
      }),
    });
    expect(result.status).toBe("warn");
  });

  it("reports the Redis version on success", async () => {
    const result = await checkRedis({
      getClient: () => ({
        ping: () => Promise.resolve("PONG"),
        info: () => Promise.resolve("redis_version:7.2.4\r\nuptime_in_seconds:10\r\n"),
        quit: () => Promise.resolve(),
      }),
    });
    expect(result.status).toBe("ok");
    expect(result.detail).toMatch(/7\.2\.4/);
  });
});
