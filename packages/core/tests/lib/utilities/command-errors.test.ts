import { describe, it, expect, beforeEach, vi } from "vitest";
import { UserError, ResultError, container } from "@sapphire/framework";
import { DiscordAPIError, HTTPError, RESTJSONErrorCodes } from "discord.js";
import { trace } from "@opentelemetry/api";
import { resolveCommandError, ERROR_TITLES } from "#lib/utilities/command-errors.js";

describe("Command Error Utilities (resolveCommandError)", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    vi.restoreAllMocks();
  });

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
    expect(res.title).toBe(ERROR_TITLES.PermissionDenied);
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
