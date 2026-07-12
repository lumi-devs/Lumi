import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FilterMessageListener } from "#modules/filter/listeners/messageCreate.js";
import { container } from "@sapphire/framework";
import { getService, tryGetService } from "#lib/module-system/Service.js";

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


});
