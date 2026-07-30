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
} from "#lib/utilities/cards.js";
import {
  ERROR_TITLES,
  resolveCommandError,
} from "#lib/utilities/command-errors.js";
import {
  deleteMessageLater,
  deleteReplyLater,
} from "#lib/utilities/temporary-message.js";

/** Builds an ephemeral error card from any thrown value. */
export function errorCard(
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
