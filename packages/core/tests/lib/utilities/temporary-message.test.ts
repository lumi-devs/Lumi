import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import {
  deleteMessageLater,
  deleteReplyLater,
  TransientReplyTtl,
} from "#lib/utilities/temporary-message.js";

// bun:test's fake-timer support only mocks the system clock (Date.now), not
// the setTimeout queue, so these wait on the real clock instead.
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

    deleteMessageLater(mockMessage, 3000, "test-reason");

    expect(mockMessage.delete).not.toHaveBeenCalled();

    await sleep(3000);

    expect(mockMessage.delete).toHaveBeenCalled();
  }, 8000);

  it("handles message.delete failure gracefully", async () => {
    const mockMessage = {
      delete: vi.fn().mockRejectedValue(new Error("Message already deleted")),
    } as any;

    deleteMessageLater(mockMessage, TransientReplyTtl, "test-delete-reason");

    await sleep(TransientReplyTtl);
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

    deleteReplyLater(mockInteraction, 4000, "test-reply-reason");

    expect(mockInteraction.deleteReply).not.toHaveBeenCalled();

    await sleep(4000);

    expect(mockInteraction.deleteReply).toHaveBeenCalled();
  }, 8000);

  it("handles interaction.deleteReply failure gracefully", async () => {
    const mockInteraction = {
      deleteReply: vi.fn().mockRejectedValue(new Error("Unknown interaction")),
    } as any;

    deleteReplyLater(mockInteraction, TransientReplyTtl, "test-reply-reason");

    await sleep(TransientReplyTtl);
    await Promise.resolve();

    expect(container.logger.debug).toHaveBeenCalledWith(
      "[swallow] test-reply-reason:",
      "Unknown interaction"
    );
  }, 8000);
});
