import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import {
  deleteMessageLater,
  deleteReplyLater,
  TransientReplyTtl,
} from "#lib/utilities/temporary-message.js";

describe("temporary-message utilities", () => {
  beforeEach(() => {
    container.logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules deletion of message after specified delay", async () => {
    const mockMessage = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as any;

    deleteMessageLater(mockMessage, 3000, "test-reason");

    expect(mockMessage.delete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);

    expect(mockMessage.delete).toHaveBeenCalled();
  });

  it("handles message.delete failure gracefully", async () => {
    const mockMessage = {
      delete: vi.fn().mockRejectedValue(new Error("Message already deleted")),
    } as any;

    deleteMessageLater(mockMessage, TransientReplyTtl, "test-delete-reason");

    expect(() => vi.advanceTimersByTime(TransientReplyTtl)).not.toThrow();
    await Promise.resolve();

    expect(container.logger.debug).toHaveBeenCalledWith(
      "[swallow] test-delete-reason:",
      "Message already deleted"
    );
  });

  it("schedules deletion of interaction reply after specified delay", async () => {
    const mockInteraction = {
      deleteReply: vi.fn().mockResolvedValue(undefined),
    } as any;

    deleteReplyLater(mockInteraction, 4000, "test-reply-reason");

    expect(mockInteraction.deleteReply).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4000);

    expect(mockInteraction.deleteReply).toHaveBeenCalled();
  });

  it("handles interaction.deleteReply failure gracefully", async () => {
    const mockInteraction = {
      deleteReply: vi.fn().mockRejectedValue(new Error("Unknown interaction")),
    } as any;

    deleteReplyLater(mockInteraction, TransientReplyTtl, "test-reply-reason");

    expect(() => vi.advanceTimersByTime(TransientReplyTtl)).not.toThrow();
    await Promise.resolve();

    expect(container.logger.debug).toHaveBeenCalledWith(
      "[swallow] test-reply-reason:",
      "Unknown interaction"
    );
  });
});
