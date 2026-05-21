import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction } from 'discord.js';
import { collectPingData } from '../lib/ping-collect.js';
import { buildOverviewCard, buildDetailCard, type PingCategory } from '../lib/ping-cards.js';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class PingInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith('ping:')) return this.none();

		const [prefix, category, userId] = interaction.customId.split(':');
		if (prefix !== 'ping' || !category || !userId) return this.none();

		// For "Overview" button (if we still have one), we'd want to edit the original message.
		// But per user request, category buttons should open NEW ephemerals.
		
		return this.some({ category: category as PingCategory | 'overview', userId });
	}

	public override async run(interaction: ButtonInteraction, result: { category: PingCategory | 'overview'; userId: string }) {
		// Security check: Only the original invoker can interact
		if (interaction.user.id !== result.userId) {
			return interaction.reply({ 
				content: '❌ Only the original invoker can use these buttons.', 
				ephemeral: true 
			});
		}

		// Acknowledge the interaction immediately by updating the original message
		await interaction.deferUpdate();
		const data = await collectPingData();

		// Overview button: show the main dashboard
		if (result.category === 'overview') {
			return interaction.editReply({
				components: [buildOverviewCard({ roundTrip: null, ...data }, result.userId)]
			});
		}

		// Category buttons: show the specific detail card
		const card = buildDetailCard(result.category as PingCategory, { roundTrip: null, ...data }, result.userId);

		return interaction.editReply({
			components: [card]
		});
	}
}
