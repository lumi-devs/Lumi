import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserError, ResultError, container } from "@sapphire/framework";
import { resolveKey } from "@sapphire/plugin-i18next";
import { DiscordAPIError, HTTPError, RESTJSONErrorCodes, MessageFlags } from "discord.js";
import { trace } from "@opentelemetry/api";
import {
  resolveErrorCard,
  resolveCommandError,
  ErrorTitles,
  sendInteractionReply,
  updatePanel,
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

  describe("resolveErrorCard", () => {
    it("creates an ephemeral error card from a thrown error", () => {
      const err = new UserError({ identifier: "PermissionDenied", message: "No permission" });
      const result = resolveErrorCard("testLabel", err);
      expect(result.expected).toBe(true);
      expect(Number(result.card.flags) & MessageFlags.Ephemeral).toBeTruthy();
      expect(result.card.components).toBeDefined();
    });
  });

  describe("resolveCommandError", () => {
    it("handles string error input", () => {
      const res = resolveCommandError("TestLabel", "Simple error message");
      expect(res).toEqual({
        title: "Command Error",
        message: "Simple error message",
        expected: true,
      });
    });

    it("unwraps ResultError instances recursively", () => {
      const innerError = new UserError({
        identifier: "PermissionDenied",
        message: "You lack permission",
      });
      const innerResultErr = new ResultError("Inner Error", innerError);
      const outerResultErr = new ResultError("Outer Error", innerResultErr);

      const res = resolveCommandError("TestLabel", outerResultErr);
      expect(res.title).toBe(ErrorTitles.PermissionDenied);
      expect(res.message).toBe("You lack permission");
      expect(res.expected).toBe(true);
    });

    it("resolves UserError with mapped and unmapped title identifiers", () => {
      const mappedErr = new UserError({
        identifier: "CooldownExpired",
        message: "Slow down, wait 5s",
      });
      const mappedRes = resolveCommandError("TestLabel", mappedErr);
      expect(mappedRes).toEqual({
        title: "Slow Down",
        message: "Slow down, wait 5s",
        expected: true,
      });

      const unmappedErr = new UserError({
        identifier: "UnknownIdentifierCustom",
        message: "Custom user error",
      });
      const unmappedRes = resolveCommandError("TestLabel", unmappedErr);
      expect(unmappedRes).toEqual({
        title: "Command Error",
        message: "Custom user error",
        expected: true,
      });
    });

    it("resolves DiscordAPIError instances for various REST error codes", () => {
      const codesToMessages = [
        { code: RESTJSONErrorCodes.UnknownChannel, expectedMsg: "That channel no longer exists." },
        { code: RESTJSONErrorCodes.UnknownGuild, expectedMsg: "This server is no longer available." },
        { code: RESTJSONErrorCodes.UnknownMember, expectedMsg: "That member is no longer in the server." },
        { code: RESTJSONErrorCodes.UnknownMessage, expectedMsg: "That message no longer exists." },
        { code: RESTJSONErrorCodes.UnknownRole, expectedMsg: "That role no longer exists." },
        { code: RESTJSONErrorCodes.UnknownUser, expectedMsg: "That user could not be found." },
        { code: RESTJSONErrorCodes.MissingAccess, expectedMsg: "I don't have access to do that here." },
        { code: RESTJSONErrorCodes.MissingPermissions, expectedMsg: "I'm missing the permissions to do that." },
        { code: RESTJSONErrorCodes.CannotSendMessagesToThisUser, expectedMsg: "I can't message that user - their DMs are closed." },
      ];

      for (const { code, expectedMsg } of codesToMessages) {
        const apiErr = new DiscordAPIError(
          { message: "API Error", code },
          code,
          400,
          "POST",
          "/test",
          {}
        );
        const res = resolveCommandError("TestLabel", apiErr);
        expect(res).toEqual({
          title: "Action Failed",
          message: expectedMsg,
          expected: true,
        });
        expect(container.logger.error).toHaveBeenCalledWith(
          `[TestLabel] Discord API error ${code}:`,
          "API Error"
        );
      }
    });

    it("resolves DiscordAPIError with an unmapped error code to default message", () => {
      const apiErr = new DiscordAPIError(
        { message: "Unknown discord error", code: 99999 },
        99999,
        400,
        "POST",
        "/test",
        {}
      );
      const res = resolveCommandError("TestLabel", apiErr);
      expect(res).toEqual({
        title: "Action Failed",
        message: "Discord rejected that action.",
        expected: true,
      });
    });

    it("resolves HTTPError instances with mapped status codes", () => {
      const statusTests = [
        { status: 500, expectedMsg: "Discord ran into an internal error. Please try again shortly." },
        { status: 502, expectedMsg: "Discord's gateway is unavailable right now. Please try again shortly." },
        { status: 503, expectedMsg: "Discord is temporarily unavailable. Please try again shortly." },
        { status: 504, expectedMsg: "Discord's gateway is unavailable right now. Please try again shortly." },
      ];

      for (const { status, expectedMsg } of statusTests) {
        const httpErr = new HTTPError(status, "HTTP Error", "GET", "/test", {});
        const res = resolveCommandError("TestLabel", httpErr);
        expect(res).toEqual({
          title: "Discord Unavailable",
          message: expectedMsg,
          expected: true,
        });
        expect(container.logger.error).toHaveBeenCalledWith(
          `[TestLabel] HTTP error ${status}:`,
          "HTTP Error"
        );
      }
    });

    it("resolves HTTPError with unmapped status code to fallback message", () => {
      const httpErr = new HTTPError(404, "Not Found", "GET", "/test", {});
      const res = resolveCommandError("TestLabel", httpErr);
      expect(res).toEqual({
        title: "Discord Unavailable",
        message: "Discord is having issues. Please try again shortly.",
        expected: true,
      });
    });

    it("resolves AbortError instance to Timed Out error", () => {
      const abortErr = new Error("Request aborted");
      abortErr.name = "AbortError";

      const res = resolveCommandError("TestLabel", abortErr);
      expect(res).toEqual({
        title: "Timed Out",
        message: "That took too long and was cancelled. Please try again.",
        expected: true,
      });
    });

    it("resolves generic unexpected Error without active span", () => {
      const unexpectedErr = new Error("Database crashed");
      vi.spyOn(trace, "getActiveSpan").mockReturnValue(undefined);

      const res = resolveCommandError("TestLabel", unexpectedErr);
      expect(res).toEqual({
        title: "Unexpected Error",
        message: "An unexpected error occurred.",
        expected: false,
        report: undefined,
      });
      expect(container.logger.error).toHaveBeenCalled();
    });

    it("resolves generic unexpected Error with active span surfacing trace ID", () => {
      const unexpectedErr = new Error("System fault");
      const mockSpan = {
        recordException: vi.fn(),
        setStatus: vi.fn(),
        spanContext: vi.fn().mockReturnValue({ traceId: "abcdef1234567890" }),
      };
      vi.spyOn(trace, "getActiveSpan").mockReturnValue(mockSpan as any);

      const res = resolveCommandError("TestLabel", unexpectedErr);
      expect(mockSpan.recordException).toHaveBeenCalledWith(unexpectedErr);
      expect(mockSpan.setStatus).toHaveBeenCalled();
      expect(res).toEqual({
        title: "Unexpected Error",
        message: "An unexpected error occurred. Reference: `abcdef1234567890`",
        expected: false,
        report: "abcdef1234567890",
      });
    });

    it("handles non-Error objects gracefully in reportUnexpected / resolveCommandError", () => {
      vi.spyOn(trace, "getActiveSpan").mockReturnValue(undefined);
      const res = resolveCommandError("TestLabel", { weird: "object" });
      expect(res).toEqual({
        title: "Unexpected Error",
        message: "An unexpected error occurred.",
        expected: false,
        report: undefined,
      });
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

  describe("updatePanel", () => {
    const card = {
      components: [{ toJSON: () => ({ type: 17 }) }],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    } as any;
    const expectedPayload = {
      components: card.components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: card.allowedMentions,
    };

    it("calls editReply when the interaction is already deferred or replied", async () => {
      const interaction = {
        deferred: true,
        replied: false,
        editReply: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
        reply: vi.fn(),
      } as any;

      await updatePanel(interaction, card);
      expect(interaction.editReply).toHaveBeenCalledWith(expectedPayload);
      expect(interaction.update).not.toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it("calls update() when the interaction supports it and is not deferred/replied", async () => {
      const interaction = {
        deferred: false,
        replied: false,
        update: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn(),
        reply: vi.fn(),
      } as any;

      await updatePanel(interaction, card);
      expect(interaction.update).toHaveBeenCalledWith(expectedPayload);
      expect(interaction.editReply).not.toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it("calls reply() for a fresh interaction with no update()", async () => {
      const interaction = {
        deferred: false,
        replied: false,
        reply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn(),
      } as any;

      await updatePanel(interaction, card);
      expect(interaction.reply).toHaveBeenCalledWith({
        ...expectedPayload,
        flags: MessageFlags.IsComponentsV2,
      });
      expect(interaction.editReply).not.toHaveBeenCalled();
    });

    it("swallows errors from editReply/update/reply and debug-logs them", async () => {
      const interaction = {
        deferred: true,
        replied: false,
        editReply: vi.fn().mockRejectedValue(new Error("Unknown Message")),
      } as any;

      await expect(updatePanel(interaction, card)).resolves.toBeUndefined();
      expect(container.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[panel] update failed:")
      );
      expect(container.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Unknown Message")
      );
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
