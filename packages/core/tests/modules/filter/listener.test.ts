import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FilterMessageListener } from "#modules/filter/listeners/messageCreate.js";
import { container } from "@sapphire/framework";
import { getService, tryGetService } from "#lib/module-system/Service.js";
import { checkDomain } from "@sapphire/phisherman";

vi.mock("@sapphire/phisherman", () => ({
  checkDomain: vi.fn(),
}));

vi.mock("#lib/module-system/Service.js", () => ({
  getService: vi.fn(),
  tryGetService: vi.fn(),
}));

describe("FilterMessageListener", () => {
  let listener: FilterMessageListener;
  let mockFilterService: any;
  let mockConfigService: any;
  let mockGuildLogService: any;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalApiKey = process.env.PHISHERMAN_API_KEY;
    process.env.PHISHERMAN_API_KEY = "test-api-key";

    mockFilterService = {
      has: vi.fn().mockReturnValue(true),
      loadGuild: vi.fn().mockResolvedValue(undefined),
      test: vi.fn().mockReturnValue(null),
    };

    mockConfigService = {
      getConfigList: vi.fn().mockResolvedValue([]),
    };

    mockGuildLogService = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(getService).mockImplementation((name: string) => {
      if (name === "filter") return mockFilterService;
      if (name === "config") return mockConfigService;
      return null as any;
    });

    vi.mocked(tryGetService).mockImplementation((name: string) => {
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
      } as any,
      { module: "filter" } as any
    );
  });

  afterEach(() => {
    process.env.PHISHERMAN_API_KEY = originalApiKey;
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

  it("should call Phisherman API check for domains in message when static rules pass", async () => {
    const mockMessage = {
      guildId: "guild-123",
      content: "check out https://dangerous-link.com/scam",
      author: {
        id: "user-123",
        toString: () => "<@user-123>",
      },
      mentions: {
        users: { size: 0 },
        roles: { size: 0 },
      },
      member: {
        permissions: {
          has: vi.fn().mockReturnValue(false),
        },
      },
      delete: vi.fn().mockResolvedValue({}),
      channel: {
        send: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(checkDomain).mockResolvedValue({
      isScam: true,
      verifiedPhish: true,
      classification: "malicious",
    });

    await (listener as any).handle(mockMessage);

    expect(checkDomain).toHaveBeenCalledWith("dangerous-link.com", "test-api-key");
    expect(mockMessage.delete).toHaveBeenCalled();
    expect(mockGuildLogService.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Filter — phish",
        reason: "dangerous-link.com",
      })
    );
  });

  it("should ignore domains that are on the link allowlist", async () => {
    const mockMessage = {
      guildId: "guild-123",
      content: "check out https://safe-domain.com/index",
      author: {
        id: "user-123",
        toString: () => "<@user-123>",
      },
      mentions: {
        users: { size: 0 },
        roles: { size: 0 },
      },
      member: {
        permissions: {
          has: vi.fn().mockReturnValue(false),
        },
      },
      delete: vi.fn().mockResolvedValue({}),
    };

    mockConfigService.getConfigList.mockImplementation((guildId: string, module: string, key: string) => {
      if (key === "link_allowlist") return ["safe-domain.com"];
      return [];
    });

    await (listener as any).handle(mockMessage);

    expect(checkDomain).not.toHaveBeenCalled();
    expect(mockMessage.delete).not.toHaveBeenCalled();
  });
});
