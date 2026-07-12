import {
  UserError,
  container,
  type ChatInputCommandDeniedPayload,
  type ContextMenuCommandDeniedPayload,
  type MessageCommandDeniedPayload,
} from "@sapphire/framework";
import { resolveKey } from "@sapphire/plugin-i18next";
import {
  MessageFlags,
  type RepliableInteraction,
  type Message,
  type InteractionReplyOptions,
  type MessageReplyOptions,
} from "discord.js";
import {
  ephemeralCard,
  makeErrorCard,
  type CardReply,
} from "#utilities/cards.js";
import {
  ERROR_TITLES,
  resolveCommandError,
} from "#utilities/command-errors.js";
import {
  deleteMessageLater,
  deleteReplyLater,
} from "#utilities/temporary-message.js";

/**
 * Build an ephemeral error card from any thrown value, resolving it through the
 * shared {@link resolveCommandError} (which also logs and reports). `expected`
 * is `false` for genuine unhandled bugs.
 */
export function errorCard(
  label: string,
  error: unknown,
): { card: CardReply; expected: boolean } {
  const { title, message, expected } = resolveCommandError(label, error);
  return { card: ephemeralCard(makeErrorCard(title, message)), expected };
}

/**
 * The single interaction reply primitive. Respects the interaction's
 * replied/deferred state so callers never double-reply.
 *
 * - `mode: "followUp"` (default) appends a new reply when one already exists —
 *   the right behavior for command output.
 * - `mode: "edit"` overwrites the existing reply — the right behavior for
 *   rendering an error over a prior response.
 */
export async function sendInteractionReply(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions,
  mode: "followUp" | "edit" = "followUp",
): Promise<Message | undefined> {
  if (interaction.replied) {
    if (mode === "followUp") return interaction.followUp(options);
    const { flags, ...editOptions } = options;
    const cleanFlags =
      flags === undefined
        ? undefined
        : Number(flags) & MessageFlags.IsComponentsV2;
    return interaction.editReply({
      ...editOptions,
      ...(cleanFlags ? { flags: cleanFlags } : {}),
    } as any);
  }
  if (interaction.deferred) {
    const { flags, ...editOptions } = options;
    const cleanFlags =
      flags === undefined
        ? undefined
        : Number(flags) & MessageFlags.IsComponentsV2;
    return interaction.editReply({
      ...editOptions,
      ...(cleanFlags ? { flags: cleanFlags } : {}),
    } as any);
  }
  await interaction.reply(options);
  return undefined;
}

/**
 * Render a transient error reply to an interaction: edit-over if already
 * replied/deferred, otherwise reply ephemerally and float a deletion.
 */
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

/** Render a transient error reply to a message-command, floating a deletion. */
export async function respondMessage(
  message: Message,
  options: MessageReplyOptions,
): Promise<Message | undefined> {
  const reply = await message.reply(options);
  deleteMessageLater(reply, undefined, "delete message after command error");
  return reply;
}

/**
 * Render a precondition/command denial to the user, unless it was marked
 * `silent`. Denials are always expected {@link UserError}s.
 */
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

  // Preconditions/commands may attach an i18n key (and interpolation vars) in
  // the UserError context. When present we render the body in the target's
  // language; the English `error.message` is the fallback if the key is missing.
  const ctx = error.context as
    | ({ i18nKey?: string } & Record<string, unknown>)
    | undefined;
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
      return await respond(interactionOrMessage as RepliableInteraction, card);
    }
    return await respondMessage(interactionOrMessage as Message, card);
  } catch (err: unknown) {
    container.logger.error("[CommandDenied] Failed to send error card:", err);
    return undefined;
  }
}
