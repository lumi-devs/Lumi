import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	type MessageActionRowComponentBuilder
} from 'discord.js';
import { EmberColors } from '#lib/branding.js';

export interface CardOptions {
	footer?: string;
	thumbnail?: string;
	divider?: boolean;
	actionRows?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

// Base reply — spread directly into interaction.reply() / followUp() / channel.send()
export interface CardReply {
	readonly flags: number;
	readonly components: ContainerBuilder[];
}

/**
 * Mark a card as ephemeral (visible only to the invoking user).
 *
 * Components V2 requires the `IsComponentsV2` flag; `Ephemeral` must be OR'd
 * with it, never replace it. Use this helper instead of passing `ephemeral: true`
 * (deprecated) or `flags: MessageFlags.Ephemeral` (clobbers `IsComponentsV2`).
 */
export function ephemeralCard(card: CardReply): CardReply {
	return { ...card, flags: card.flags | MessageFlags.Ephemeral };
}

// ── Internal builders ─────────────────────────────────────────────────────────

function buildContainer(_color: number, title: string, body: string | string[], opts: CardOptions = {}): ContainerBuilder {
	// Accent sidebar disabled — never call setAccentColor so Discord renders no colored bar.
	// `color` is kept in the signature so semantic call sites stay descriptive.
	const c = new ContainerBuilder();
	c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
	c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(opts.divider ?? true));

	const bodyParts = Array.isArray(body) ? body : [body];
	for (let i = 0; i < bodyParts.length; i++) {
		if (i > 0) {
			c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		}
		c.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyParts[i]));
	}

	if (opts.footer) {
		c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
		c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${opts.footer}`));
	}
	if (opts.actionRows) {
		for (const row of opts.actionRows) c.addActionRowComponents(row);
	}
	return c;
}

function wrap(c: ContainerBuilder): CardReply {
	return { flags: MessageFlags.IsComponentsV2 as number, components: [c] };
}

// ── Static cards ──────────────────────────────────────────────────────────────

export function makeSuccessCard(title: string, body: string | string[], opts?: CardOptions): CardReply {
	return wrap(buildContainer(EmberColors.SUCCESS, title, body, opts));
}

export function makeErrorCard(title: string, body: string | string[], opts?: CardOptions): CardReply {
	return wrap(buildContainer(EmberColors.ERROR, title, body, opts));
}

export function makeWarningCard(title: string, body: string | string[], opts?: CardOptions): CardReply {
	return wrap(buildContainer(EmberColors.WARNING, title, body, opts));
}

export function makeInfoCard(title: string, body: string | string[], opts?: CardOptions): CardReply {
	return wrap(buildContainer(EmberColors.INFO, title, body, opts));
}

export function makeCard(color: number, title: string, body: string | string[], opts?: CardOptions): CardReply {
	return wrap(buildContainer(color, title, body, opts));
}

export function makeFieldsCard(title: string, fields: { name: string; value: string }[], opts?: CardOptions): CardReply {
	const body = fields.map((f) => `**${f.name}**: ${f.value}`).join('\n');
	return wrap(buildContainer(EmberColors.PRIMARY, title, body, opts));
}

// ── List card with optional pagination ───────────────────────────────────────

export function makeListCard(title: string, items: string[], page = 0, perPage = 10, customIdPrefix?: string): CardReply {
	const totalPages = Math.max(1, Math.ceil(items.length / perPage));
	const slice = items.slice(page * perPage, (page + 1) * perPage);
	const body = slice.length ? slice.join('\n') : '*Nothing here yet.*';
	const footer = totalPages > 1 ? `Page ${page + 1}/${totalPages} · ${items.length} items` : `${items.length} items`;

	const c = buildContainer(EmberColors.PRIMARY, title, body, { footer });

	if (customIdPrefix && totalPages > 1) {
		c.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`${customIdPrefix}:prev:${page}`)
					.setLabel('◀ Prev')
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(page <= 0),
				new ButtonBuilder()
					.setCustomId(`${customIdPrefix}:next:${page}`)
					.setLabel('Next ▶')
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(page >= totalPages - 1)
			)
		);
	}

	return wrap(c);
}
