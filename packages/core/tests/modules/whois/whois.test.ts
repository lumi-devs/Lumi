import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhoisCommand } from "../../../src/modules/utility/commands/whois.js";
import { container } from "@sapphire/framework";
import { PermissionFlagsBits, type User, type GuildMember } from "discord.js";

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

describe("WhoisCommand", () => {
  let command: WhoisCommand;

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

    command = new WhoisCommand(
      {
        name: "whois",
        path: "/path/to/whois.ts",
        root: "/path/to",
        store: { name: "commands" } as any,
      } as any,
      {}
    );
  });

  it("should register application chat input commands", () => {
    const mockOption = {
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      setRequired: vi.fn().mockReturnThis(),
    };
    const mockBuilder = {
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      addUserOption: vi.fn().mockImplementation((cb) => {
        cb(mockOption);
        return mockBuilder;
      }),
      setDefaultMemberPermissions: vi.fn().mockReturnThis(),
      setContexts: vi.fn().mockReturnThis(),
      setIntegrationTypes: vi.fn().mockReturnThis(),
    };
    const spy = vi.fn().mockImplementation((cb) => cb(mockBuilder));
    const mockRegistry = { registerChatInputCommand: spy };

    command.registerApplicationCommands(mockRegistry as any);
    expect(spy).toHaveBeenCalled();
    expect(mockBuilder.addUserOption).toHaveBeenCalled();
  });

  describe("chatInputRun", () => {
    it("should fetch user/member from interaction options and send reply", async () => {
      const mockUser = {
        id: "123",
        username: "testuser",
        discriminator: "0",
        bot: false,
        createdAt: new Date(),
        toString: () => "<@123>",
        displayAvatarURL: vi.fn().mockReturnValue("https://avatar.png"),
      };
      const mockMember = {
        id: "123",
        guild: { id: "G1" },
        displayColor: 0x123456,
        joinedAt: new Date(),
        premiumSince: new Date(),
        permissions: { has: vi.fn().mockReturnValue(true) }, // Admin
        roles: {
          cache: {
            filter: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            map: vi.fn().mockReturnValue(["<@&r1>"]),
            size: 1,
          },
        },
      };

      const mockInteraction = {
        user: mockUser,
        guildId: "G1",
        guild: {
          members: { fetch: vi.fn().mockResolvedValue(mockMember) },
        },
        options: {
          getUser: vi.fn().mockReturnValue(mockUser),
          getMember: vi.fn().mockReturnValue(mockMember),
        },
      };

      await command.chatInputRun(mockInteraction as any);
      expect(sendReply).toHaveBeenCalledWith(mockInteraction, expect.any(Object));
    });

    it("should fallback to fetching member from guild when getMember returns null", async () => {
      const mockUser = {
        id: "123",
        username: "testuser",
        discriminator: "1234",
        bot: true,
        createdAt: new Date(),
        toString: () => "<@123>",
        displayAvatarURL: vi.fn().mockReturnValue(null),
      };

      const mockInteraction = {
        user: mockUser,
        guildId: "G1",
        guild: {
          members: { fetch: vi.fn().mockResolvedValue(null) },
        },
        options: {
          getUser: vi.fn().mockReturnValue(null),
          getMember: vi.fn().mockReturnValue(null),
        },
      };

      await command.chatInputRun(mockInteraction as any);
      expect(sendReply).toHaveBeenCalled();
    });
  });

  describe("messageRun", () => {
    it("should return early if channel is not sendable", async () => {
      const mockMessage = {
        channel: { isSendable: () => false },
      };
      await command.messageRun(mockMessage as any, {} as any);
    });

    it("should handle messageRun with self user when args finished", async () => {
      const mockUser = {
        id: "123",
        username: "author",
        discriminator: "0",
        bot: false,
        createdAt: new Date(),
        toString: () => "<@123>",
        displayAvatarURL: vi.fn().mockReturnValue("https://avatar.png"),
      };
      const mockMessage = {
        channel: { isSendable: () => true },
        author: mockUser,
        guildId: "G1",
        guild: {
          members: { fetch: vi.fn().mockResolvedValue(null) },
        },
        reply: vi.fn().mockResolvedValue(undefined),
      };
      const mockArgs = { finished: true };

      await command.messageRun(mockMessage as any, mockArgs as any);
      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it("should handle user pick success in messageRun", async () => {
      const mockTargetUser = {
        id: "456",
        username: "target",
        discriminator: "0001",
        bot: false,
        createdAt: new Date(),
        toString: () => "<@456>",
        displayAvatarURL: vi.fn().mockReturnValue("https://avatar.png"),
      };
      const mockMessage = {
        channel: { isSendable: () => true },
        author: { id: "123" },
        guildId: "G1",
        guild: {
          members: { fetch: vi.fn().mockResolvedValue(null) },
        },
        reply: vi.fn().mockResolvedValue(undefined),
      };
      const mockArgs = {
        finished: false,
        pickResult: vi.fn().mockResolvedValue({
          isOk: () => true,
          unwrap: () => mockTargetUser,
        }),
      };

      await command.messageRun(mockMessage as any, mockArgs as any);
      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it("should handle user pick failure in messageRun", async () => {
      const mockMessage = {
        channel: { isSendable: () => true },
        author: { id: "123" },
        reply: vi.fn().mockResolvedValue(undefined),
      };
      const mockArgs = {
        finished: false,
        pickResult: vi.fn().mockResolvedValue({
          isOk: () => false,
        }),
      };

      await command.messageRun(mockMessage as any, mockArgs as any);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({ allowedMentions: {} })
      );
    });
  });

  describe("buildWhoisCard edge cases", () => {
    const mockT = (key: string, opts?: any) => `${key}${opts ? ":" + JSON.stringify(opts) : ""}`;

    it("should format member roles when total length > 800 chars", () => {
      const mockUser = {
        id: "12345",
        username: "lumiuser",
        discriminator: "0000",
        bot: false,
        createdAt: new Date(),
        toString: () => "<@12345>",
        displayAvatarURL: vi.fn().mockReturnValue("https://avatar.png"),
      } as unknown as User;

      const manyRoles = Array.from({ length: 40 }, (_, i) => `<@&role_very_long_name_${i}_0123456789>`);
      const mockMember = {
        id: "12345",
        guild: { id: "G1" },
        displayColor: 0x00ff00,
        joinedAt: new Date(),
        premiumSince: null,
        permissions: {
          has: vi.fn().mockImplementation((flag) => flag === PermissionFlagsBits.ManageGuild),
        },
        roles: {
          cache: {
            filter: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            map: vi.fn().mockReturnValue(manyRoles),
            size: 40,
          },
        },
      } as unknown as GuildMember;

      const card = (command as any).buildWhoisCard(mockUser, mockMember, "G1", mockT);
      expect(card).toBeDefined();
    });

    it("should format member permissions when user has specific key permissions without Admin", () => {
      const mockUser = {
        id: "12345",
        username: "lumiuser",
        discriminator: "0",
        bot: true,
        createdAt: new Date(),
        toString: () => "<@12345>",
        displayAvatarURL: vi.fn().mockReturnValue(null),
      } as unknown as User;

      const mockMember = {
        id: "12345",
        guild: { id: "G1" },
        displayColor: 0,
        joinedAt: new Date(),
        premiumSince: null,
        permissions: {
          has: vi.fn().mockImplementation((flag) => flag === PermissionFlagsBits.BanMembers || flag === PermissionFlagsBits.KickMembers),
        },
        roles: {
          cache: {
            filter: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            map: vi.fn().mockReturnValue([]),
            size: 0,
          },
        },
      } as unknown as GuildMember;

      const card = (command as any).buildWhoisCard(mockUser, mockMember, "G1", mockT);
      expect(card).toBeDefined();
    });

    it("should format member permissions when user has no key permissions", () => {
      const mockUser = {
        id: "12345",
        username: "lumiuser",
        discriminator: "0",
        bot: false,
        createdAt: new Date(),
        toString: () => "<@12345>",
        displayAvatarURL: vi.fn().mockReturnValue(null),
      } as unknown as User;

      const mockMember = {
        id: "12345",
        guild: { id: "G1" },
        displayColor: 0,
        joinedAt: new Date(),
        premiumSince: null,
        permissions: {
          has: vi.fn().mockReturnValue(false),
        },
        roles: {
          cache: {
            filter: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            map: vi.fn().mockReturnValue([]),
            size: 0,
          },
        },
      } as unknown as GuildMember;

      const card = (command as any).buildWhoisCard(mockUser, mockMember, "G1", mockT);
      expect(card).toBeDefined();
    });
  });
});
