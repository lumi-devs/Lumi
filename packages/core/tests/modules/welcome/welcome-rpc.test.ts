import { describe, it, expect, vi, beforeEach } from "bun:test";
import { welcomeRpcHandlers } from "#modules/welcome/rpc.js";
import { container } from "@sapphire/framework";

vi.mock("#lib/rpc/discord-rest-lookup.js", () => ({
  fetchChannelRest: vi.fn(),
  fetchGuildMemberRest: vi.fn(),
  fetchGuildRest: vi.fn(),
  checkGuildManagerRest: vi.fn().mockResolvedValue({ isManager: true }),
  GuildTextBasedChannelTypes: new Set([0]),
  guildIconUrl: vi.fn().mockReturnValue(null),
  memberAvatarUrl: vi.fn().mockReturnValue("https://avatar.test"),
}));

vi.mock("@lumi/application/services/welcome/welcome.js", () => ({
  loadWelcomeConfig: vi.fn(),
  renderWelcomeCard: vi.fn().mockReturnValue({ components: [] }),
  renderGoodbyeCard: vi.fn().mockReturnValue({ components: [] }),
  templateVarsFor: vi.fn().mockReturnValue({}),
}));

import {
  fetchChannelRest,
  fetchGuildMemberRest,
  fetchGuildRest,
} from "#lib/rpc/discord-rest-lookup.js";
import { loadWelcomeConfig } from "@lumi/application/services/welcome/welcome.js";

describe("Welcome RPC Handlers", () => {
  const handler = welcomeRpcHandlers.get("guild.welcome.sendTest");

  beforeEach(() => {
    vi.clearAllMocks();
    container.logger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as any;
    container.client = {
      rest: {
        post: vi.fn().mockResolvedValue({ id: "msg-1" }),
      },
    } as any;
  });

  it("throws when channel is not configured for the requested kind", async () => {
    (loadWelcomeConfig as any).mockResolvedValue({ welcomeChannel: null, goodbyeChannel: null });

    const req = {
      id: "1",
      action: "guild.welcome.sendTest",
      guildId: "111111111111111111",
      actorId: "222222222222222222",
      data: { kind: "welcome" },
    };

    expect(handler!(req as any)).rejects.toThrow("Set a welcome channel before sending a test message.");
  });

  it("throws when guild is not found via REST", async () => {
    (loadWelcomeConfig as any).mockResolvedValue({ welcomeChannel: "333333333333333333" });
    (fetchGuildRest as any).mockResolvedValue(null);

    const req = {
      id: "1",
      action: "guild.welcome.sendTest",
      guildId: "111111111111111111",
      actorId: "222222222222222222",
      data: { kind: "welcome" },
    };

    expect(handler!(req as any)).rejects.toThrow("Guild not found in bot cache");
  });

  it("throws when member is not found in the guild", async () => {
    (loadWelcomeConfig as any).mockResolvedValue({ welcomeChannel: "333333333333333333" });
    (fetchGuildRest as any).mockResolvedValue({ name: "Test Guild" });
    (fetchGuildMemberRest as any).mockResolvedValue(null);

    const req = {
      id: "1",
      action: "guild.welcome.sendTest",
      guildId: "111111111111111111",
      actorId: "222222222222222222",
      data: { kind: "welcome" },
    };

    expect(handler!(req as any)).rejects.toThrow("Could not resolve your member in this guild.");
  });

  it("sends test card and returns { sent: true } on success", async () => {
    (loadWelcomeConfig as any).mockResolvedValue({ welcomeChannel: "333333333333333333" });
    (fetchGuildRest as any).mockResolvedValue({ name: "Test Guild", approximate_member_count: 50 });
    (fetchGuildMemberRest as any).mockResolvedValue({ user: { id: "u-1", username: "tester" } });
    (fetchChannelRest as any).mockResolvedValue({
      id: "333333333333333333",
      guild_id: "111111111111111111",
      type: 0,
    });

    const req = {
      id: "1",
      action: "guild.welcome.sendTest",
      guildId: "111111111111111111",
      actorId: "222222222222222222",
      data: { kind: "welcome" },
    };

    const res = await handler!(req);
    expect(res).toEqual({ sent: true });
    expect(container.client.rest.post).toHaveBeenCalled();
  });
});
