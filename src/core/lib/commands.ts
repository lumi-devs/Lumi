import { Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { ChatInputCommandInteraction, InteractionEditReplyOptions, InteractionReplyOptions } from 'discord.js';
import { ephemeralCard, makeErrorCard, makeInfoCard, makeSuccessCard, makeWarningCard } from '#utilities/cards.js';

interface ReplyOptions {
	ephemeral?: boolean;
}

// ── Free reply helpers ──────────────────────────────────────────────────────
// Shared by EmberCommand, EmberSubcommand, and ad-hoc callers.

export async function sendReply(interaction: ChatInputCommandInteraction, payload: InteractionReplyOptions): Promise<void> {
	if (interaction.replied) {
		await interaction.followUp(payload);
	} else if (interaction.deferred) {
		await interaction.editReply(payload as InteractionEditReplyOptions);
	} else {
		await interaction.reply(payload);
	}
}

export function replySuccess(interaction: ChatInputCommandInteraction, title: string, body: string, opts: ReplyOptions = {}) {
	const card = makeSuccessCard(title, body);
	return sendReply(interaction, opts.ephemeral === false ? card : ephemeralCard(card));
}

export function replyError(interaction: ChatInputCommandInteraction, title: string, body: string, opts: ReplyOptions = {}) {
	const card = makeErrorCard(title, body);
	return sendReply(interaction, opts.ephemeral === false ? card : ephemeralCard(card));
}

export function replyWarning(interaction: ChatInputCommandInteraction, title: string, body: string, opts: ReplyOptions = {}) {
	const card = makeWarningCard(title, body);
	return sendReply(interaction, opts.ephemeral === false ? card : ephemeralCard(card));
}

export function replyInfo(interaction: ChatInputCommandInteraction, title: string, body: string, opts: ReplyOptions = {}) {
	const card = makeInfoCard(title, body);
	return sendReply(interaction, opts.ephemeral === false ? card : ephemeralCard(card));
}

// ── Base classes ────────────────────────────────────────────────────────────

abstract class WithRepliesMixin extends Command {
	protected reply(interaction: ChatInputCommandInteraction, payload: InteractionReplyOptions) {
		return sendReply(interaction, payload);
	}

	protected replySuccess(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replySuccess(interaction, title, body, opts);
	}

	protected replyError(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replyError(interaction, title, body, opts);
	}

	protected replyWarning(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replyWarning(interaction, title, body, opts);
	}

	protected replyInfo(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replyInfo(interaction, title, body, opts);
	}
}

export abstract class EmberCommand extends WithRepliesMixin {
	protected get prisma() {
		return this.container.prisma;
	}

	protected get redis() {
		return this.container.redis;
	}

	protected get moduleManager() {
		return this.container.moduleManager;
	}
}

export abstract class EmberSubcommand extends Subcommand {
	protected get prisma() {
		return this.container.prisma;
	}

	protected get redis() {
		return this.container.redis;
	}

	protected get moduleManager() {
		return this.container.moduleManager;
	}

	protected reply(interaction: ChatInputCommandInteraction, payload: InteractionReplyOptions) {
		return sendReply(interaction, payload);
	}

	protected replySuccess(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replySuccess(interaction, title, body, opts);
	}

	protected replyError(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replyError(interaction, title, body, opts);
	}

	protected replyWarning(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replyWarning(interaction, title, body, opts);
	}

	protected replyInfo(interaction: ChatInputCommandInteraction, title: string, body: string, opts?: ReplyOptions) {
		return replyInfo(interaction, title, body, opts);
	}
}
