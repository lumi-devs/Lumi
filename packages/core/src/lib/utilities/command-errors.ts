import { UserError, ResultError, container } from "@sapphire/framework";
import { DiscordAPIError, HTTPError, RESTJSONErrorCodes } from "discord.js";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { errorFrom } from "#lib/utilities/errors.js";

/**
 * Friendly card titles for known {@link UserError} identifiers thrown by
 * preconditions and commands. The single source of truth shared by every
 * command-denied and command-error listener.
 */
export const ERROR_TITLES: Partial<Record<string, string>> = {
  PermissionDenied: "Permission Denied",
  AccessDenied: "Access Denied",
  GuildOnly: "Server Only",
  CooldownExpired: "Slow Down",
  ModuleEnabled: "Feature Disabled",
  NotBlocked: "Cannot Block",
  NotIgnored: "Cannot Ignore",
};

export interface ResolvedCommandError {
  /** Card title to show the user. */
  title: string;
  /** Card body to show the user. */
  message: string;
  /**
   * `true` when the failure is operational/expected (a `UserError`, a Discord
   * API/HTTP hiccup, an abort) and should NOT be alarm-logged or alerted on.
   * `false` for genuine unhandled bugs.
   */
  expected: boolean;
  /** OTEL trace id for unexpected errors, surfaced to the user as a reference. */
  report?: string;
}

/** Map a Discord REST error code to a user-facing message, or null if unmapped. */
function messageForDiscordCode(code: number): string | null {
  switch (code) {
    case RESTJSONErrorCodes.UnknownChannel:
      return "That channel no longer exists.";
    case RESTJSONErrorCodes.UnknownGuild:
      return "This server is no longer available.";
    case RESTJSONErrorCodes.UnknownMember:
      return "That member is no longer in the server.";
    case RESTJSONErrorCodes.UnknownMessage:
      return "That message no longer exists.";
    case RESTJSONErrorCodes.UnknownRole:
      return "That role no longer exists.";
    case RESTJSONErrorCodes.UnknownUser:
      return "That user could not be found.";
    case RESTJSONErrorCodes.MissingAccess:
      return "I don't have access to do that here.";
    case RESTJSONErrorCodes.MissingPermissions:
      return "I'm missing the permissions to do that.";
    case RESTJSONErrorCodes.CannotSendMessagesToThisUser:
      return "I can't message that user — their DMs are closed.";
    default:
      return null;
  }
}

/** Map an HTTP status from Discord to a user-facing message, or null if unmapped. */
function messageForHttpStatus(status: number): string | null {
  switch (status) {
    case 500:
      return "Discord ran into an internal error. Please try again shortly.";
    case 502:
    case 504:
      return "Discord's gateway is unavailable right now. Please try again shortly.";
    case 503:
      return "Discord is temporarily unavailable. Please try again shortly.";
    default:
      return null;
  }
}

/** Capture an unexpected error to the active OTEL span and return its trace id, if any. */
function reportUnexpected(_label: string, error: unknown): string | undefined {
  try {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      return span.spanContext().traceId;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Resolve any thrown value into a user-facing {@link ResolvedCommandError},
 * logging it at the appropriate level as a side effect.
 *
 * Mirrors Skyra's `flattenError`: unwrap `ResultError`, translate `UserError`,
 * map Discord API/HTTP/abort failures to friendly messages, and capture genuine
 * unhandled errors to OTEL with a trace id for the user.
 *
 * @param label A short identifier for the source (e.g. `"Command:ban"`).
 */
export function resolveCommandError(
  label: string,
  error: unknown,
): ResolvedCommandError {
  if (typeof error === "string") {
    return { title: "Command Error", message: error, expected: true };
  }

  if (error instanceof ResultError) {
    return resolveCommandError(label, error.value);
  }

  if (error instanceof UserError) {
    return {
      title: ERROR_TITLES[error.identifier] ?? "Command Error",
      message: error.message,
      expected: true,
    };
  }

  if (error instanceof DiscordAPIError) {
    container.logger.error(
      `[${label}] Discord API error ${error.code}:`,
      error.message,
    );
    return {
      title: "Action Failed",
      message:
        messageForDiscordCode(Number(error.code)) ??
        "Discord rejected that action.",
      expected: true,
    };
  }

  if (error instanceof HTTPError) {
    container.logger.error(
      `[${label}] HTTP error ${error.status}:`,
      error.message,
    );
    return {
      title: "Discord Unavailable",
      message:
        messageForHttpStatus(error.status) ??
        "Discord is having issues. Please try again shortly.",
      expected: true,
    };
  }

  if (error instanceof Error && error.name === "AbortError") {
    return {
      title: "Timed Out",
      message: "That took too long and was cancelled. Please try again.",
      expected: true,
    };
  }

  container.logger.error(`[${label}] Unhandled error:`, errorFrom(error));
  const report = reportUnexpected(label, error);
  return {
    title: "Unexpected Error",
    message: report
      ? `An unexpected error occurred. Reference: \`${report}\``
      : "An unexpected error occurred.",
    expected: false,
    report,
  };
}
