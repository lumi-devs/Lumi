import {
	UserError,
	type ChatInputCommandDeniedPayload,
	type ContextMenuCommandDeniedPayload,
	type MessageCommandDeniedPayload
} from '@sapphire/framework';
import { MessageFlags, type RepliableInteraction, type Message, type InteractionReplyOptions, type MessageReplyOptions } from 'discord.js';
import { makeErrorCard } from '#utilities/cards.js';

export function cardFor(error: unknown) {
	if (error instanceof UserError) {
		return { card: makeErrorCard('Permission Denied', error.message), expected: true };
	}
	return { card: makeErrorCard('Command Error', 'An unexpected error occurred.'), expected: false };
}

export async function respond(interaction: RepliableInteraction, options: InteractionReplyOptions) {
	if (interaction.replied || interaction.deferred) {
		const { flags: _flags, ...editOptions } = options;
		return interaction.editReply(editOptions);
	}
	const existingFlags = typeof options.flags === 'number' ? options.flags : 0;
	return interaction.reply({ ...options, flags: existingFlags | MessageFlags.Ephemeral } as InteractionReplyOptions);
}

export async function respondMessage(message: Message, options: MessageReplyOptions) {
	return message.reply(options);
}

export async function handleDenied(
	interactionOrMessage: RepliableInteraction | Message,
	error: UserError,
	payload: ChatInputCommandDeniedPayload | ContextMenuCommandDeniedPayload | MessageCommandDeniedPayload
) {
	const content = payload.context.silent ? undefined : error.message;
	if (!content) return;

	const card = makeErrorCard('Permission Denied', content);

	if ('showModal' in interactionOrMessage || 'reply' in interactionOrMessage) {
		return respond(interactionOrMessage as RepliableInteraction, card);
	}
	return respondMessage(interactionOrMessage as Message, card);
}
