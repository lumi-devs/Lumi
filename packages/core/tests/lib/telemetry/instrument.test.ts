import { describe, it, expect, beforeEach, vi } from "vitest";
import { instrumentCommandPiece } from "#lib/telemetry/instrument.js";
import * as observability from "@lumi/observability";

describe("Telemetry & Instrumentation (instrumentCommandPiece)", () => {
  let mockStopTimer: any;
  let mockInc: any;
  let lastMockSpan: { setAttribute: ReturnType<typeof vi.fn> } | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    lastMockSpan = null;

    mockStopTimer = vi.fn();
    mockInc = vi.fn();

    vi.spyOn(observability.commandDuration, "startTimer").mockReturnValue(mockStopTimer);
    vi.spyOn(observability.commandsTotal, "inc").mockImplementation(mockInc);

    vi.spyOn(observability, "runWithContext").mockImplementation((ctx: any, fn: any) => fn());
    vi.spyOn(observability, "withSpan").mockImplementation(async (name: string, fn: any, opts: any) => {
      const mockSpan = {
        setAttribute: vi.fn(),
      };
      lastMockSpan = mockSpan;
      return fn(mockSpan);
    });
  });

  it("wraps chatInputRun, messageRun, and contextMenuRun on a piece", async () => {
    const originalChatInput = vi.fn().mockResolvedValue("chat-result");
    const originalMessage = vi.fn().mockResolvedValue("message-result");
    const originalContextMenu = vi.fn().mockResolvedValue("context-result");

    const piece = {
      name: "testCommand",
      chatInputRun: originalChatInput,
      messageRun: originalMessage,
      contextMenuRun: originalContextMenu,
    };

    instrumentCommandPiece(piece);

    // Call chatInputRun
    const interactionSource = {
      guildId: "guild-999",
      user: { id: "user-888" },
    };
    const resChat = await piece.chatInputRun(interactionSource, "arg1");

    expect(resChat).toBe("chat-result");
    expect(originalChatInput).toHaveBeenCalledWith(interactionSource, "arg1");
    expect(observability.withSpan).toHaveBeenCalledWith("command testCommand", expect.any(Function), { kind: 1 });
    expect(observability.runWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "command",
        name: "testCommand",
        guildId: "guild-999",
        userId: "user-888",
      }),
      expect.any(Function)
    );
    expect(observability.commandDuration.startTimer).toHaveBeenCalledWith({
      command: "testCommand",
      type: "chat",
    });
    expect(observability.commandsTotal.inc).toHaveBeenCalledWith({
      command: "testCommand",
      type: "chat",
      status: "success",
    });
    expect(mockStopTimer).toHaveBeenCalled();
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command", "testCommand");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command.type", "chat");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("discord.guild.id", "guild-999");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("discord.user.id", "user-888");

    // Call messageRun
    const messageSource = {
      guild: { id: "guild-777" },
      author: { id: "user-666" },
    };
    const resMsg = await piece.messageRun(messageSource);

    expect(resMsg).toBe("message-result");
    expect(originalMessage).toHaveBeenCalledWith(messageSource);
    expect(observability.commandDuration.startTimer).toHaveBeenCalledWith({
      command: "testCommand",
      type: "message",
    });
    expect(observability.commandsTotal.inc).toHaveBeenCalledWith({
      command: "testCommand",
      type: "message",
      status: "success",
    });
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command", "testCommand");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command.type", "message");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("discord.guild.id", "guild-777");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("discord.user.id", "user-666");

    // Call contextMenuRun
    const resContext = await piece.contextMenuRun(interactionSource);
    expect(resContext).toBe("context-result");
    expect(observability.commandDuration.startTimer).toHaveBeenCalledWith({
      command: "testCommand",
      type: "context",
    });
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command", "testCommand");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command.type", "context");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("discord.guild.id", "guild-999");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("discord.user.id", "user-888");
  });

  it("increments error counter, calls stop timer, and rethrows when command execution throws", async () => {
    const error = new Error("Command execution failed");
    const failingChatInput = vi.fn().mockRejectedValue(error);

    const piece = {
      name: "failingCommand",
      chatInputRun: failingChatInput,
    };

    instrumentCommandPiece(piece);

    const source = { guildId: "guild-1" };

    await expect(piece.chatInputRun(source)).rejects.toThrow(error);

    expect(observability.commandsTotal.inc).toHaveBeenCalledWith({
      command: "failingCommand",
      type: "chat",
      status: "error",
    });
    expect(mockStopTimer).toHaveBeenCalled();
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command", "failingCommand");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command.type", "chat");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("discord.guild.id", "guild-1");
  });

  it("ignores non-function properties or missing run methods on piece", () => {
    const piece = {
      name: "minimalPiece",
      chatInputRun: "not a function",
    };

    instrumentCommandPiece(piece as any);

    expect(typeof piece.chatInputRun).toBe("string");
  });

  it("sets correct telemetry attributes when guildId and userId are provided or omitted", async () => {
    const piece = {
      name: "attribCommand",
      chatInputRun: vi.fn().mockResolvedValue("ok"),
    };
    instrumentCommandPiece(piece);

    // Source without guild or user
    await piece.chatInputRun({});
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command", "attribCommand");
    expect(lastMockSpan?.setAttribute).toHaveBeenCalledWith("lumi.command.type", "chat");
    expect(lastMockSpan?.setAttribute).not.toHaveBeenCalledWith("discord.guild.id", expect.anything());
    expect(lastMockSpan?.setAttribute).not.toHaveBeenCalledWith("discord.user.id", expect.anything());
  });
});
