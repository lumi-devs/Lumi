import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction } from 'discord.js';
import { EmberColors } from '#utilities/branding.js';
import { ephemeralCard, makeCard, makeErrorCard } from '#utilities/cards.js';
import { getAfkMentions, type AfkMention } from '../index.js';
import { humanizeDelta } from '#utilities/time.js';

const PAGE_SIZE = 10;

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class AfkMentionsHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith('afk:mentions:')) return this.none();
		const parts = interaction.customId.split(':');
		const guildId = parts[2];
		const userId = parts[3];
		if (!guildId || !userId) return this.none();

		// afk:mentions:{guildId}:{userId}             → open, page 0
		// afk:mentions:{guildId}:{userId}:prev:{page} → go to page - 1
		// afk:mentions:{guildId}:{userId}:next:{page} → go to page + 1
		const dir = parts[4];
		const currentPage = parseInt(parts[5] ?? '0', 10);
		let page = 0;
		if (dir === 'prev') page = Math.max(0, currentPage - 1);
		else if (dir === 'next') page = currentPage + 1;

		return this.some({ guildId, userId, page, isNavigation: dir === 'prev' || dir === 'next' });
	}

	public async run(
		interaction: ButtonInteraction,
		{ guildId, userId, page, isNavigation }: { guildId: string; userId: string; page: number; isNavigation: boolean }
	) {
		if (interaction.user.id !== userId) {
			return interaction.reply(ephemeralCard(makeErrorCard('Not Yours', 'Only the user who was AFK can view their mention list.')));
		}

		const mentions = await getAfkMentions(guildId, userId);
		const totalPages = Math.max(1, Math.ceil(mentions.length / PAGE_SIZE));
		const safePage = Math.min(page, totalPages - 1);
		const slice = mentions.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

		const body = slice.length
			? slice.map((m, i) => renderMention(guildId, m, safePage * PAGE_SIZE + i + 1)).join('\n\n')
			: '*No mentions recorded.*';

		const footer =
			totalPages > 1
				? `Page ${safePage + 1}/${totalPages} · ${mentions.length} ${mentions.length === 1 ? 'mention' : 'mentions'} · most recent first`
				: `${mentions.length} ${mentions.length === 1 ? 'mention' : 'mentions'} · most recent first`;

		const base = `afk:mentions:${guildId}:${userId}`;
		const actionRows =
			totalPages > 1
				? [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setCustomId(`${base}:prev:${safePage}`)
								.setLabel('◀ Prev')
								.setStyle(ButtonStyle.Secondary)
								.setDisabled(safePage <= 0),
							new ButtonBuilder()
								.setCustomId(`${base}:next:${safePage}`)
								.setLabel('Next ▶')
								.setStyle(ButtonStyle.Secondary)
								.setDisabled(safePage >= totalPages - 1)
						)
					]
				: undefined;

		const card = makeCard(EmberColors.GOLD, '📬 Mentions While AFK', body, { footer, actionRows });

		return isNavigation ? interaction.update(card) : interaction.reply(ephemeralCard(card));
	}
}

function renderMention(guildId: string, m: AfkMention, n: number): string {
	const link = `https://discord.com/channels/${guildId}/${m.channelId}/${m.messageId}`;
	const ago = humanizeDelta(Math.max(0, Math.floor(Date.now() / 1000 - m.ts)));
	return `${n}. <@${m.authorId}> mentioned you **${ago}** ago\n　<#${m.channelId}> · [Jump](${link})`;
}
