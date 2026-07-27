import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserError } from "@sapphire/framework";
import * as i18n from "@sapphire/plugin-i18next";
import { MessageFlags } from "discord.js";
import { CommandContext } from "#lib/command-context.js";
import * as permissions from "#lib/permissions/index.js";
import * as commandResponse from "#lib/utilities/command-response.js";

vi.mock("@sapphire/plugin-i18next", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/utilities/command-response.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

describe("CommandContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fromInteraction", () => {
    it("provides getters and throws when accessing message getter on slash context", () => {
      const mockInteraction = {
        user: { id: "user-1" },
        member: { id: "user-1", roles: {} },
        guild: { id: "guild-1" },
        guildId: "guild-1",
        channelId: "channel-1",
        options: {},
      } as any;

      const ctx = CommandContext.fromInteraction(mockInteraction);

      expect(ctx.isSlash).toBe(true);
      expect(ctx.interaction).toBe(mockInteraction);
      expect(() => ctx.message).toThrow("CommandContext: not a message");
      expect(ctx.user).toEqual({ id: "user-1" });
      expect(ctx.member).toBe(mockInteraction.member);
      expect(ctx.guild).toBe(mockInteraction.guild);
      expect(ctx.guildId).toBe("guild-1");
      expect(ctx.channelId).toBe("channel-1");
    });

    it("gets option values via interaction options", async () => {
      const options = {
        getString: vi.fn().mockReturnValue("str-val"),
        getInteger: vi.fn().mockReturnValue(42),
        getNumber: vi.fn().mockReturnValue(3.14),
        getBoolean: vi.fn().mockReturnValue(true),
        getUser: vi.fn().mockReturnValue({ id: "u-2" }),
        getMember: vi.fn().mockReturnValue({ id: "u-2" }),
        getRole: vi.fn().mockReturnValue({ id: "r-1" }),
        getChannel: vi.fn().mockReturnValue({ id: "c-1" }),
      };

      const mockInteraction = { options } as any;
      const ctx = CommandContext.fromInteraction(mockInteraction);

      expect(await ctx.getString("opt")).toBe("str-val");
      expect(await ctx.getInteger("opt")).toBe(42);
      expect(await ctx.getNumber("opt")).toBe(3.14);
      expect(await ctx.getBoolean("opt")).toBe(true);
      expect(await ctx.getUser("opt")).toEqual({ id: "u-2" });
      expect(await ctx.getMember("opt")).toEqual({ id: "u-2" });
      expect(await ctx.getRole("opt")).toEqual({ id: "r-1" });
      expect(await ctx.getChannel("opt")).toEqual({ id: "c-1" });
    });

    it("throws MissingArgument error when required member option is missing on slash path", async () => {
      const mockInteraction = {
        options: { getMember: vi.fn().mockReturnValue(null) },
      } as any;

      const ctx = CommandContext.fromInteraction(mockInteraction);
      await expect(ctx.getMember("target", { required: true })).rejects.toThrow(UserError);
    });

    it("defers reply on slash interaction", async () => {
      const mockInteraction = {
        deferred: false,
        replied: false,
        deferReply: vi.fn().mockResolvedValue(undefined),
      } as any;

      const ctx = CommandContext.fromInteraction(mockInteraction);
      await ctx.defer({ ephemeral: true });

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    });

    it("replies on slash interaction using sendInteractionReply", async () => {
      const mockInteraction = {} as any;
      const ctx = CommandContext.fromInteraction(mockInteraction);

      await ctx.replySuccess("Success Title", "Success Body");
      expect(commandResponse.sendInteractionReply).toHaveBeenCalled();
    });
  });

  describe("fromMessage", () => {
    it("provides getters and throws when accessing interaction getter on message context", () => {
      const mockMessage = {
        author: { id: "user-2" },
        member: null,
        guild: null,
        guildId: null,
        channelId: "channel-2",
      } as any;
      const mockArgs = {} as any;

      const ctx = CommandContext.fromMessage(mockMessage, mockArgs);

      expect(ctx.isSlash).toBe(false);
      expect(ctx.message).toBe(mockMessage);
      expect(() => ctx.interaction).toThrow("CommandContext: not an interaction");
      expect(ctx.user).toEqual({ id: "user-2" });
      expect(ctx.member).toBeNull();
    });

    it("reads positional arguments and throws MissingArgument when required argument is missing", async () => {
      const mockArgs = {
        pick: vi.fn().mockImplementation((type: string) => {
          if (type === "string") return Promise.resolve("hello");
          return Promise.reject(new Error("Parse fail"));
        }),
        rest: vi.fn().mockResolvedValue("rest string"),
      } as any;

      const mockMessage = {} as any;
      const ctx = CommandContext.fromMessage(mockMessage, mockArgs);

      expect(await ctx.getString("str")).toBe("hello");
      expect(await ctx.getString("restStr", { rest: true })).toBe("rest string");

      // Required integer missing -> throws UserError
      await expect(ctx.getInteger("num", { required: true })).rejects.toThrow(UserError);
    });

    it("sends message reply on first card and edits on subsequent card replies", async () => {
      const mockReplyMsg = {
        edit: vi.fn().mockResolvedValue(undefined),
      } as any;
      const mockMessage = {
        reply: vi.fn().mockResolvedValue(mockReplyMsg),
      } as any;

      const ctx = CommandContext.fromMessage(mockMessage, {} as any);

      await ctx.replyInfo("Info 1", "Body 1");
      expect(mockMessage.reply).toHaveBeenCalledTimes(1);

      await ctx.replyWarning("Warning 2", "Body 2");
      expect(mockReplyMsg.edit).toHaveBeenCalledTimes(1);
    });
  });

  describe("checkPermission & fetchT", () => {
    it("checks permission level and passes when user level >= required", async () => {
      vi.spyOn(permissions, "resolvePermissionLevel").mockResolvedValue(permissions.PermissionLevel.ADMIN);

      const ctx = CommandContext.fromInteraction({} as any);
      await expect(ctx.checkPermission(permissions.PermissionLevel.MOD)).resolves.toBeUndefined();
    });

    it("throws UserError when user permission level < required", async () => {
      vi.spyOn(permissions, "resolvePermissionLevel").mockResolvedValue(permissions.PermissionLevel.USER);

      const ctx = CommandContext.fromInteraction({} as any);
      await expect(ctx.checkPermission(permissions.PermissionLevel.ADMIN)).rejects.toThrow(UserError);
    });

    it("calls fetchT with source", async () => {
      const ctx = CommandContext.fromInteraction({} as any);
      const t = await ctx.fetchT();
      expect(t).toBeDefined();
      expect(i18n.fetchT).toHaveBeenCalled();
    });
  });
});
