import {
  UserError,
  ResultError,
  container,
  type ChatInputCommandDeniedPayload,
  type ContextMenuCommandDeniedPayload,
  type MessageCommandDeniedPayload,
} from "@sapphire/framework";
import { resolveKey } from "@sapphire/plugin-i18next";
import { DiscordAPIError, HTTPError, RESTJSONErrorCodes } from "discord.js";
import {
  MessageFlags,
  type RepliableInteraction,
  type Message,
  type InteractionReplyOptions,
  type MessageReplyOptions,
} from "discord.js";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  ephemeralCard,
  makeErrorCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import { errorFrom } from "#lib/utilities/errors.js";
import {
  deleteMessageLater,
  deleteReplyLater,
} from "#lib/utilities/temporary-message.js";

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
      return "I can't message that user - their DMs are closed.";
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
function reportUnexpected(error: unknown): string | undefined {
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
  const report = reportUnexpected(error);
  return {
    title: "Unexpected Error",
    message: report
      ? `An unexpected error occurred. Reference: \`${report}\``
      : "An unexpected error occurred.",
    expected: false,
    report,
  };
}

/**
 * Resolves any thrown value into an ephemeral error card ready to send, plus
 * whether the failure was expected (for logging/alerting decisions).
 */
export function resolveErrorCard(
  label: string,
  error: unknown,
): { card: CardReply; expected: boolean } {
  const { title, message, expected } = resolveCommandError(label, error);
  return { card: ephemeralCard(makeErrorCard(title, message)), expected };
}

/** Interaction reply helper respecting replied/deferred state. */
export async function sendInteractionReply(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions,
  mode: "followUp" | "edit" = "followUp",
): Promise<Message | undefined> {
  const { flags, ...editOptions } = options;
  const cleanFlags =
    flags === undefined
      ? undefined
      : Number(flags) & MessageFlags.IsComponentsV2;

  if (interaction.replied) {
    if (mode === "followUp") return interaction.followUp(options);
    return interaction.editReply({
      ...editOptions,
      ...(cleanFlags ? { flags: cleanFlags } : {}),
    });
  }
  if (interaction.deferred) {
    return interaction.editReply({
      ...editOptions,
      ...(cleanFlags ? { flags: cleanFlags } : {}),
    });
  }
  await interaction.reply(options);
  return undefined;
}

/**
 * Re-renders a panel card in place on a component or modal interaction.
 * Strips ephemerality flags (immutable after send) and swallows expiry errors.
 */
export async function updatePanel(
  interaction: RepliableInteraction,
  card: CardReply,
): Promise<void> {
  const flags =
    Number(card.flags ?? MessageFlags.IsComponentsV2) &
    MessageFlags.IsComponentsV2;
  const payload = {
    components: card.components,
    flags,
    allowedMentions: card.allowedMentions,
  };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else if ("update" in interaction && typeof interaction.update === "function") {
      await (interaction as { update: (p: unknown) => Promise<unknown> }).update(payload);
    } else {
      await interaction.reply({ ...payload, flags });
    }
  } catch (err: unknown) {
    container.logger.debug(`[panel] update failed: ${String(err)}`);
  }
}

/** Renders a transient error reply to an interaction. */
export async function respond(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions,
): Promise<Message | undefined> {
  if (interaction.replied || interaction.deferred) {
    return sendInteractionReply(interaction, options, "edit");
  }

  const flags = options.flags ?? MessageFlags.Ephemeral;
  await interaction.reply({ ...options, flags } as InteractionReplyOptions);
  deleteReplyLater(interaction, undefined, "deleteReply after command error");
  return undefined;
}

/** Renders a transient error reply to a message. */
export async function respondMessage(
  message: Message,
  options: MessageReplyOptions,
): Promise<Message | undefined> {
  const reply = await message.reply(options);
  deleteMessageLater(reply, undefined, "delete message after command error");
  return reply;
}

/** Renders a precondition or command denial to the user. */
export async function handleDenied(
  interactionOrMessage: RepliableInteraction | Message,
  error: UserError,
  payload:
    | ChatInputCommandDeniedPayload
    | ContextMenuCommandDeniedPayload
    | MessageCommandDeniedPayload,
): Promise<Message | undefined> {
  if (payload.context.silent) return;

  const title = ERROR_TITLES[error.identifier] ?? "Command Error";

  const ctx = error.context as
    ({ i18nKey?: string } & Record<string, unknown>) | undefined;
  let body = error.message;
  if (ctx?.i18nKey) {
    try {
      body = await resolveKey(interactionOrMessage, ctx.i18nKey, {
        ...ctx,
        defaultValue: error.message,
      });
    } catch (err: unknown) {
      container.logger.warn("[CommandDenied] i18n resolve failed:", err);
    }
  }

  const card = ephemeralCard(makeErrorCard(title, body));

  try {
    if ("showModal" in interactionOrMessage) {
      return await respond(interactionOrMessage, card);
    }
    return await respondMessage(interactionOrMessage as Message, card);
  } catch (err: unknown) {
    container.logger.error("[CommandDenied] Failed to send error card:", err);
    return undefined;
  }
}
