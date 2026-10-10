import { describe, it, expect } from "bun:test";
import { GatewayIntentBits } from "discord.js";
import { ApplicationFlags } from "discord-api-types/v10";
import { checkPrivilegedIntents } from "@lumi/lib/doctor/checks/privileged-intents.js";

describe("checkPrivilegedIntents", () => {
  it("fails when no token is configured", async () => {
    const result = await checkPrivilegedIntents({
      getToken: () => {
        throw new Error("missing");
      },
    });
    expect(result.status).toBe("fail");
  });

  it("warns when a requested privileged intent has no matching application flag", async () => {
    const result = await checkPrivilegedIntents({
      getToken: () => "t",
      requestedIntents: [GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent],
      fetchApplication: () =>
        Promise.resolve({ flags: ApplicationFlags.GatewayMessageContent } as any),
    });
    expect(result.status).toBe("warn");
    expect(result.detail).toMatch(/GuildMembers/);
    expect(result.detail).not.toMatch(/MessageContent/);
  });

  it("accepts the limited variant of a privileged flag", async () => {
    const result = await checkPrivilegedIntents({
      getToken: () => "t",
      requestedIntents: [GatewayIntentBits.GuildPresences],
      fetchApplication: () =>
        Promise.resolve({ flags: ApplicationFlags.GatewayPresenceLimited } as any),
    });
    expect(result.status).toBe("ok");
  });

  it("ok when every requested privileged intent is enabled", async () => {
    const result = await checkPrivilegedIntents({
      getToken: () => "t",
      requestedIntents: [
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
      ],
      fetchApplication: () =>
        Promise.resolve({
          flags:
            ApplicationFlags.GatewayGuildMembers |
            ApplicationFlags.GatewayPresence |
            ApplicationFlags.GatewayMessageContent,
        } as any),
    });
    expect(result.status).toBe("ok");
  });

  it("fails when the application lookup throws", async () => {
    const result = await checkPrivilegedIntents({
      getToken: () => "t",
      fetchApplication: () => Promise.reject(new Error("boom")),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/boom/);
  });
});
