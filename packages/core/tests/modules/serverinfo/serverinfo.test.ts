import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServerInfoCommand } from "../../../src/modules/utility/commands/serverinfo.js";
import { container } from "@sapphire/framework";

vi.mock("#lib/commands.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    sendReply: vi.fn().mockResolvedValue(undefined),
    fetchTyped: vi.fn().mockResolvedValue((key: string, opts?: any) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    }),
  };
});

import { sendReply } from "#lib/commands.js";

describe("ServerInfoCommand", () => {
  let command: ServerInfoCommand;

  beforeEach(() => {
    vi.restoreAllMocks();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    (container as any).client = {
      options: {},
    } as any;

    command = new ServerInfoCommand(
      {
        name: "serverinfo",
        path: "/path/to/serverinfo.ts",
        root: "/path/to",
        store: { name: "commands" } as any,
      } as any,
      {}
    );
  });

  it("should register application chat input command", () => {
    const mockBuilder = {
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      setDefaultMemberPermissions: vi.fn().mockReturnThis(),
      setContexts: vi.fn().mockReturnThis(),
      setIntegrationTypes: vi.fn().mockReturnThis(),
    };
    const spy = vi.fn().mockImplementation((cb) => cb(mockBuilder));
    const mockRegistry = { registerChatInputCommand: spy };

    command.registerApplicationCommands(mockRegistry as any);
    expect(spy).toHaveBeenCalled();
  });

  describe("chatInputRun", () => {
    it("should execute chatInputRun and reply with server info card", async () => {
      const mockGuild = {
        id: "G1",
        name: "Test Guild",
        createdAt: new Date(),
        memberCount: 100,
        premiumSubscriptionCount: 2,
        premiumTier: 1,
        verificationLevel: "MEDIUM",
        iconURL: vi.fn().mockReturnValue("https://icon.png"),
        fetchOwner: vi.fn().mockResolvedValue({
          id: "owner-1",
          user: { toString: () => "<@owner-1>" },
        }),
        channels: {
          cache: {
            size: 10,
            filter: vi.fn().mockReturnValue({ size: 3 }),
          },
        },
        emojis: { cache: { size: 5 } },
        roles: { cache: { size: 12 } },
      };

      const mockInteraction = {
        guild: mockGuild,
      };

      await command.chatInputRun(mockInteraction as any);
      expect(sendReply).toHaveBeenCalledWith(mockInteraction, expect.any(Object));
    });
  });

  describe("messageRun", () => {
    it("should return early if message channel is not sendable", async () => {
      const mockMessage = {
        channel: { isSendable: () => false },
      };

      await command.messageRun(mockMessage as any);
    });

    it("should send serverinfo reply card for sendable channel", async () => {
      const mockGuild = {
        id: "G1",
        name: "Test Guild",
        createdAt: new Date(),
        memberCount: 10,
        premiumSubscriptionCount: 0,
        premiumTier: 0,
        verificationLevel: "NONE",
        iconURL: vi.fn().mockReturnValue(null),
        fetchOwner: vi.fn().mockResolvedValue({
          id: "owner-1",
          user: { toString: () => "<@owner-1>" },
        }),
        channels: {
          cache: {
            size: 4,
            filter: vi.fn().mockReturnValue({ size: 1 }),
          },
        },
        emojis: { cache: { size: 0 } },
        roles: { cache: { size: 2 } },
      };

      const mockMessage = {
        channel: { isSendable: () => true },
        guild: mockGuild,
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await command.messageRun(mockMessage as any);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({ allowedMentions: {} })
      );
    });
  });

  describe("buildServerCard", () => {
    it("should format server card without boost info or icon link when 0 boosts and no icon", async () => {
      const mockGuild = {
        id: "G1",
        name: "No Boost Guild",
        createdAt: new Date(),
        memberCount: 5,
        premiumSubscriptionCount: 0,
        premiumTier: 0,
        verificationLevel: "LOW",
        iconURL: vi.fn().mockReturnValue(null),
        fetchOwner: vi.fn().mockResolvedValue({
          id: "owner-1",
          user: { toString: () => "<@owner-1>" },
        }),
        channels: {
          cache: {
            size: 2,
            filter: vi.fn().mockReturnValue({ size: 1 }),
          },
        },
        emojis: { cache: { size: 0 } },
        roles: { cache: { size: 1 } },
      };

      const mockCtx = { guild: mockGuild } as any;
      const mockT = (k: string, opts?: any) => `${k}${opts ? ":" + JSON.stringify(opts) : ""}`;

      const card = await (command as any).buildServerCard(mockCtx, mockT);
      expect(card).toBeDefined();
    });
  });
});
