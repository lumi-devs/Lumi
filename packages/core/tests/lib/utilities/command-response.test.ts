import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserError, container } from "@sapphire/framework";
import { resolveKey } from "@sapphire/plugin-i18next";
import { MessageFlags } from "discord.js";
import {
  errorCard,
  sendInteractionReply,
  respond,
  respondMessage,
  handleDenied,
} from "#lib/utilities/command-response.js";
import * as temporaryMessage from "#lib/utilities/temporary-message.js";

vi.mock("@sapphire/plugin-i18next", () => ({
  resolveKey: vi.fn(),
}));

vi.mock("#lib/utilities/temporary-message.js", () => ({
  deleteMessageLater: vi.fn(),
  deleteReplyLater: vi.fn(),
}));

describe("command-response utilities", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    vi.clearAllMocks();
  });

  describe("errorCard", () => {
    it("creates an ephemeral error card from a thrown error", () => {
      const err = new UserError({ identifier: "PermissionDenied", message: "No permission" });
      const result = errorCard("testLabel", err);
      expect(result.expected).toBe(true);
      expect(Number(result.card.flags) & MessageFlags.Ephemeral).toBeTruthy();
      expect(result.card.components).toBeDefined();
    });
  });

  describe("sendInteractionReply", () => {
    it("handles replied interaction in followUp mode", async () => {
      const interaction = {
        replied: true,
        deferred: false,
        followUp: vi.fn().mockResolvedValue({ id: "msg-1" }),
        editReply: vi.fn(),
        reply: vi.fn(),
      } as any;

      const res = await sendInteractionReply(interaction, { content: "hello" }, "followUp");
      expect(interaction.followUp).toHaveBeenCalledWith({ content: "hello" });
      expect(res).toEqual({ id: "msg-1" });
    });

    it("handles replied interaction in edit mode with flags filtering", async () => {
      const interaction = {
        replied: true,
        deferred: false,
        followUp: vi.fn(),
        editReply: vi.fn().mockResolvedValue({ id: "msg-2" }),
        reply: vi.fn(),
      } as any;

      const res = await sendInteractionReply(
        interaction,
        { content: "hello", flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 },
        "edit"
      );
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: "hello",
        flags: MessageFlags.IsComponentsV2,
      });
      expect(res).toEqual({ id: "msg-2" });
    });

    it("handles deferred interaction with undefined flags", async () => {
      const interaction = {
        replied: false,
        deferred: true,
        editReply: vi.fn().mockResolvedValue({ id: "msg-3" }),
        reply: vi.fn(),
      } as any;

      const res = await sendInteractionReply(interaction, { content: "deferred edit" });
      expect(interaction.editReply).toHaveBeenCalledWith({ content: "deferred edit" });
      expect(res).toEqual({ id: "msg-3" });
    });

    it("handles unreplied and undeferred interaction", async () => {
      const interaction = {
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
      } as any;

      const res = await sendInteractionReply(interaction, { content: "direct reply" });
      expect(interaction.reply).toHaveBeenCalledWith({ content: "direct reply" });
      expect(res).toBeUndefined();
    });
  });

  describe("respond", () => {
    it("edits reply if replied or deferred", async () => {
      const interaction = {
        replied: true,
        deferred: false,
        editReply: vi.fn().mockResolvedValue({ id: "edited" }),
      } as any;

      const res = await respond(interaction, { content: "edit response" });
      expect(interaction.editReply).toHaveBeenCalled();
      expect(res).toEqual({ id: "edited" });
    });

    it("replies directly and schedules deletion if fresh interaction", async () => {
      const interaction = {
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
      } as any;

      const res = await respond(interaction, { content: "transient" });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: "transient",
        flags: MessageFlags.Ephemeral,
      });
      expect(temporaryMessage.deleteReplyLater).toHaveBeenCalledWith(
        interaction,
        undefined,
        "deleteReply after command error"
      );
      expect(res).toBeUndefined();
    });
  });

  describe("respondMessage", () => {
    it("replies to message and schedules deletion", async () => {
      const message = {
        reply: vi.fn().mockResolvedValue({ id: "reply-msg" }),
      } as any;

      const res = await respondMessage(message, { content: "err" });
      expect(message.reply).toHaveBeenCalledWith({ content: "err" });
      expect(temporaryMessage.deleteMessageLater).toHaveBeenCalledWith(
        { id: "reply-msg" },
        undefined,
        "delete message after command error"
      );
      expect(res).toEqual({ id: "reply-msg" });
    });
  });

  describe("handleDenied", () => {
    it("returns early if silent context is set", async () => {
      const interaction = { replied: false } as any;
      const error = new UserError({ identifier: "AccessDenied", message: "Denied" });
      const payload = { context: { silent: true } } as any;

      const res = await handleDenied(interaction, error, payload);
      expect(res).toBeUndefined();
    });

    it("handles interaction denial with i18n resolution", async () => {
      const interaction = {
        showModal: vi.fn(),
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
      } as any;
      const error = new UserError({
        identifier: "PermissionDenied",
        message: "Default msg",
        context: { i18nKey: "errors:permission_denied" },
      });
      const payload = { context: { silent: false } } as any;

      vi.mocked(resolveKey).mockResolvedValue("Resolved i18n message" as any);

      await handleDenied(interaction, error, payload);
      expect(resolveKey).toHaveBeenCalledWith(
        interaction,
        "errors:permission_denied",
        expect.objectContaining({ defaultValue: "Default msg" })
      );
      expect(interaction.reply).toHaveBeenCalled();
    });

    it("logs warning if i18n resolution throws error", async () => {
      const interaction = {
        showModal: vi.fn(),
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
      } as any;
      const error = new UserError({
        identifier: "PermissionDenied",
        message: "Default msg",
        context: { i18nKey: "errors:failing_key" },
      });
      const payload = { context: { silent: false } } as any;

      vi.mocked(resolveKey).mockRejectedValue(new Error("i18n failed"));

      await handleDenied(interaction, error, payload);
      expect(container.logger.warn).toHaveBeenCalledWith(
        "[CommandDenied] i18n resolve failed:",
        expect.any(Error)
      );
    });

    it("handles message denial and logs error if sending fails", async () => {
      const message = {
        reply: vi.fn().mockRejectedValue(new Error("Network fail")),
      } as any;
      const error = new UserError({ identifier: "AccessDenied", message: "No entry" });
      const payload = { context: { silent: false } } as any;

      const res = await handleDenied(message, error, payload);
      expect(res).toBeUndefined();
      expect(container.logger.error).toHaveBeenCalledWith(
        "[CommandDenied] Failed to send error card:",
        expect.any(Error)
      );
    });
  });
});
