import {
  UserError,
  container,
  type ChatInputCommandDeniedPayload,
  type ContextMenuCommandDeniedPayload,
  type MessageCommandDeniedPayload,
} from "@sapphire/framework";
import {
  MessageFlags,
  type RepliableInteraction,
  type Message,
  type InteractionReplyOptions,
  type MessageReplyOptions,
} from "discord.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { swallow } from "#utilities/errors.js";

const ERROR_TITLES: Partial<Record<string, string>> = {
  PermissionDenied: "Permission Denied",
  AccessDenied: "Access Denied",
  GuildOnly: "Server Only",
  CooldownExpired: "Slow Down",
  ModuleEnabled: "Feature Disabled",
  NotBlocked: "Cannot Block",
  NotIgnored: "Cannot Ignore",
};

export function cardFor(error: unknown): {
  card: import("#utilities/cards.js").CardReply;
  expected: boolean;
} {
  if (error instanceof UserError) {
    const title = ERROR_TITLES[error.identifier] ?? "Command Error";
    return {
      card: ephemeralCard(makeErrorCard(title, error.message)),
      expected: true,
    };
  }
  return {
    card: ephemeralCard(
      makeErrorCard("Command Error", "An unexpected error occurred."),
    ),
    expected: false,
  };
}

export async function respond(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions,
): Promise<Message | undefined> {
  if (interaction.replied || interaction.deferred) {
    // Note: editReply ignores 'flags'. If the original reply wasn't ephemeral,
    // we can't make this one ephemeral. We filter 'flags' out to prevent D.JS warnings.
    const { flags: _flags, ...editOptions } = options;
    return interaction.editReply(editOptions);
  }

  // For new replies, default to Ephemeral if not explicitly set otherwise
  const flags = options.flags ?? MessageFlags.Ephemeral;
  await interaction.reply({ ...options, flags } as InteractionReplyOptions);

  setTimeout(() => {
    interaction.deleteReply().catch(swallow("deleteReply after command error"));
  }, 5_000).unref();
  return undefined;
}
export async function respondMessage(
  message: Message,
  options: MessageReplyOptions,
): Promise<Message | undefined> {
  const reply = await message.reply(options);
  setTimeout(() => {
    reply.delete().catch(swallow("delete message after command error"));
  }, 5_000).unref();
  return reply;
}

export async function handleDenied(
  interactionOrMessage: RepliableInteraction | Message,
  error: UserError,
  payload:
    | ChatInputCommandDeniedPayload
    | ContextMenuCommandDeniedPayload
    | MessageCommandDeniedPayload,
): Promise<Message | undefined> {
  const content = payload.context.silent ? undefined : error.message;
  if (!content) return;

  const title = ERROR_TITLES[error.identifier] ?? "Command Error";
  const card = ephemeralCard(makeErrorCard(title, content));

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
