import { describe, it, expect } from "bun:test";
import { checkDiscordToken } from "@lumi/lib/doctor/checks/discord-token.js";

describe("checkDiscordToken", () => {
  it("fails when no token is configured", async () => {
    const result = await checkDiscordToken({
      getToken: () => {
        throw new Error("missing");
      },
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/BOT_TOKEN/);
  });

  it("fails when the Discord API call throws", async () => {
    const result = await checkDiscordToken({
      getToken: () => "t",
      fetchMe: () => Promise.reject(new Error("401 Unauthorized")),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/401 Unauthorized/);
  });

  it("reports ok with no clock skew info when the header is absent", async () => {
    const result = await checkDiscordToken({
      getToken: () => "t",
      fetchMe: () =>
        Promise.resolve({ user: { id: "1", username: "Lumi" } as any, date: null }),
    });
    expect(result.status).toBe("ok");
    expect(result.detail).toMatch(/Lumi/);
  });

  it("warns on moderate clock skew", async () => {
    const skewed = new Date(Date.now() - 10_000);
    const result = await checkDiscordToken({
      getToken: () => "t",
      fetchMe: () =>
        Promise.resolve({ user: { id: "1", username: "Lumi" } as any, date: skewed }),
    });
    expect(result.status).toBe("warn");
  });

  it("fails on large clock skew", async () => {
    const skewed = new Date(Date.now() - 120_000);
    const result = await checkDiscordToken({
      getToken: () => "t",
      fetchMe: () =>
        Promise.resolve({ user: { id: "1", username: "Lumi" } as any, date: skewed }),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/clock/);
  });

  it("reports ok with negligible clock skew", async () => {
    const result = await checkDiscordToken({
      getToken: () => "t",
      fetchMe: () =>
        Promise.resolve({ user: { id: "1", username: "Lumi" } as any, date: new Date() }),
    });
    expect(result.status).toBe("ok");
  });
});
