import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import {
  deleteMessageLater,
  deleteReplyLater,
} from "#src/lib/utilities/TemporaryMessage.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("temporary-message utilities", () => {
  beforeEach(() => {
    container.logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;
  });

  it("schedules deletion of message after specified delay", async () => {
    const mockMessage = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as any;

    deleteMessageLater(mockMessage, 50, "test-reason");

    expect(mockMessage.delete).not.toHaveBeenCalled();

    await sleep(500);

    expect(mockMessage.delete).toHaveBeenCalled();
  }, 8000);

  it("handles message.delete failure gracefully", async () => {
    const mockMessage = {
      delete: vi.fn().mockRejectedValue(new Error("Message already deleted")),
    } as any;

    deleteMessageLater(mockMessage, 50, "test-delete-reason");

    await sleep(500);
    await Promise.resolve();

    expect(container.logger.debug).toHaveBeenCalledWith(
      "[swallow] test-delete-reason:",
      "Message already deleted"
    );
  }, 8000);

  it("schedules deletion of interaction reply after specified delay", async () => {
    const mockInteraction = {
      deleteReply: vi.fn().mockResolvedValue(undefined),
    } as any;

    deleteReplyLater(mockInteraction, 50, "test-reply-reason");

    expect(mockInteraction.deleteReply).not.toHaveBeenCalled();

    await sleep(500);

    expect(mockInteraction.deleteReply).toHaveBeenCalled();
  }, 8000);

  it("handles interaction.deleteReply failure gracefully", async () => {
    const mockInteraction = {
      deleteReply: vi.fn().mockRejectedValue(new Error("Unknown interaction")),
    } as any;

    deleteReplyLater(mockInteraction, 50, "test-reply-reason");

    await sleep(500);
    await Promise.resolve();

    expect(container.logger.debug).toHaveBeenCalledWith(
      "[swallow] test-reply-reason:",
      "Unknown interaction"
    );
  }, 8000);
});
