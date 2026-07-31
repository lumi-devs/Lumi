import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterMessageListener } from "#modules/filter/listeners/messageCreate.js";
import { container } from "@sapphire/framework";
import { getService, tryGetService } from "#lib/module-system/Service.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";

vi.mock("#lib/module-system/Service.js", () => ({
  getService: vi.fn(),
  tryGetService: vi.fn(),
}));

vi.mock("#lib/utilities/temporary-message.js", () => ({
  deleteMessageLater: vi.fn(),
}));

vi.mock("#lib/commands.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    fetchTyped: vi.fn().mockResolvedValue((key: string, opts?: any) => {
      if (key === "filter:defaultWarnMessage") return "Default warning for {user}: {reason}";
      return key;
    }),
  };
});

describe("FilterMessageListener", () => {
  let listener: FilterMessageListener;
  let mockFilterService: any;
  let mockConfigService: any;
  let mockGuildLogService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFilterService = {
      has: vi.fn().mockReturnValue(true),
      loadGuild: vi.fn().mockResolvedValue(undefined),
      test: vi.fn().mockReturnValue(null),
      getHeat: vi.fn().mockReturnValue({ enabled: false }),
    };

    mockConfigService = {
      getConfigList: vi.fn().mockResolvedValue([]),
    };

    mockGuildLogService = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };

    (getService as any).mockImplementation((name: string) => {
      if (name === "filter") return mockFilterService;
      if (name === "config") return mockConfigService;
      return null as any;
    });

    (tryGetService as any).mockImplementation((name: string) => {
      if (name === "guild-log") return mockGuildLogService;
      return null as any;
    });

    container.logger = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    } as any;

    container.client = {
      user: { id: "bot-123" },
    } as any;

    container.db = {
      config: {
        getModuleConfig: vi.fn().mockResolvedValue(null),
      },
    } as any;

    listener = new FilterMessageListener(
      {
        name: "messageCreate",
        path: "/path/to/modules/filter/listeners/messageCreate.ts",
        root: "/path/to/modules",
        store: { name: "listeners" } as any,
      },
      { module: "filter" }
    );
  });

  it("should do nothing if member has ManageMessages permission", async () => {
    const mockMessage = {
      member: {
        permissions: {
          has: vi.fn().mockReturnValue(true),
        },
      },
    };

    await (listener as any).handle(mockMessage);
    expect(mockFilterService.test).not.toHaveBeenCalled();
  });

  it("should load guild config if not loaded yet", async () => {
    mockFilterService.has.mockReturnValue(false);
    const mockMessage = {
      guildId: "G1",
      member: { permissions: { has: vi.fn().mockReturnValue(false) } },
      mentions: { users: { size: 0 }, roles: { size: 0 } },
      content: "hello world",
    };

    await (listener as any).handle(mockMessage);
    expect(mockFilterService.loadGuild).toHaveBeenCalledWith("G1");
    expect(mockFilterService.test).toHaveBeenCalledWith("G1", "hello world", 0);
  });

  it("should return early if test does not trigger a hit", async () => {
    const mockMessage = {
      guildId: "G1",
      member: { permissions: { has: vi.fn().mockReturnValue(false) } },
      mentions: { users: { size: 1 }, roles: { size: 1 } },
      content: "clean message",
    };

    await (listener as any).handle(mockMessage);
    expect(mockFilterService.test).toHaveBeenCalledWith("G1", "clean message", 2);
  });

  it("should skip action if user has an exempt role", async () => {
    const mockHit = { rule: "badword", detail: "swearing" };
    mockFilterService.test.mockReturnValue(mockHit);
    mockConfigService.getConfigList.mockResolvedValue(["role-mod", "role-vip"]);

    const mockMessage = {
      guildId: "G1",
      member: {
        permissions: { has: vi.fn().mockReturnValue(false) },
        roles: { cache: { has: (id: string) => id === "role-vip" } },
      },
      mentions: { users: { size: 0 }, roles: { size: 0 } },
      content: "bad word message",
      delete: vi.fn(),
    };

    await (listener as any).handle(mockMessage);
    expect(mockMessage.delete).not.toHaveBeenCalled();
  });

  it("should delete message, send warning, timeout member, and log when filter is hit", async () => {
    const mockHit = { rule: "invite", detail: "discord.gg/test" };
    mockFilterService.test.mockReturnValue(mockHit);
    mockConfigService.getConfigList.mockResolvedValue([]);

    container.db.config.getModuleConfig = vi.fn().mockImplementation((_gId, _mod, key) => {
      if (key === "warn_message") return "Hey {user}, no invite links! ({reason})";
      if (key === "timeout_minutes") return 10;
      return null;
    });

    const mockWarnMessageObj = { id: "warn-msg-1" };
    const mockSend = vi.fn().mockResolvedValue(mockWarnMessageObj);
    const mockTimeout = vi.fn().mockResolvedValue(undefined);

    const mockMessage = {
      guildId: "G1",
      channelId: "C1",
      author: { id: "user-456", toString: () => "<@user-456>" },
      member: {
        permissions: { has: vi.fn().mockReturnValue(false) },
        roles: { cache: { has: () => false } },
        timeout: mockTimeout,
      },
      mentions: { users: { size: 0 }, roles: { size: 0 } },
      content: "join discord.gg/test",
      delete: vi.fn().mockResolvedValue(undefined),
      channel: { send: mockSend },
    };

    await (listener as any).handle(mockMessage);

    expect(mockMessage.delete).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining("<@user-456>"));
    expect(deleteMessageLater).toHaveBeenCalledWith(mockWarnMessageObj, undefined, "Filter: delete warning");
    expect(mockTimeout).toHaveBeenCalledWith(600_000, expect.stringContaining("invite"));
    expect(mockGuildLogService.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "G1",
        moduleName: "filter",
        targetId: "user-456",
        actorId: "bot-123",
      })
    );
  });

  it("should handle error in message delete gracefully via swallow", async () => {
    const mockHit = { rule: "badword", detail: "swear" };
    mockFilterService.test.mockReturnValue(mockHit);
    container.db.config.getModuleConfig = vi.fn().mockResolvedValue(null);

    const mockMessage = {
      guildId: "G1",
      channelId: "C1",
      author: { id: "user-456", toString: () => "<@user-456>" },
      member: {
        permissions: { has: vi.fn().mockReturnValue(false) },
        roles: { cache: { has: () => false } },
      },
      mentions: { users: { size: 0 }, roles: { size: 0 } },
      content: "bad word",
      delete: vi.fn().mockRejectedValue(new Error("Unknown Message")),
      channel: { send: vi.fn().mockResolvedValue(null) },
    };

    await expect((listener as any).handle(mockMessage)).resolves.not.toThrow();
  });

  it("should handle empty warn message template without sending warning", async () => {
    const mockHit = { rule: "badword", detail: "swear" };
    mockFilterService.test.mockReturnValue(mockHit);
    container.db.config.getModuleConfig = vi.fn().mockImplementation((_g, _m, key) => {
      if (key === "warn_message") return "   "; // whitespace resulting in empty string
      return 0; // timeout disabled
    });

    const mockSend = vi.fn();
    const mockMessage = {
      guildId: "G1",
      channelId: "C1",
      author: { id: "user-456", toString: () => "<@user-456>" },
      member: {
        permissions: { has: vi.fn().mockReturnValue(false) },
        roles: null,
      },
      mentions: { users: { size: 0 }, roles: { size: 0 } },
      content: "bad word",
      delete: vi.fn().mockResolvedValue(undefined),
      channel: { send: mockSend },
    };

    await (listener as any).handle(mockMessage);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
