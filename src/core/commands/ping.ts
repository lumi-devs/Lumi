import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { type ChatInputCommandInteraction, type Message } from 'discord.js';
import { EmberCommand } from '#lib/commands.js';
import { collectPingData } from '../lib/ping-collect.js';
import { buildOverviewCard, PING_FLAGS } from '../lib/ping-cards.js';

@ApplyOptions<Command.Options>({
	name: 'ping',
	description: 'Check the bot status, latency, and system health.'
})
export class PingCommand extends EmberCommand {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const data = await collectPingData();

		// Initial send
		const response = await interaction.reply({
			flags: PING_FLAGS,
			components: [buildOverviewCard({ roundTrip: null, ...data }, interaction.user.id)],
			fetchReply: true
		});

		// Calculate round-trip
		const roundTrip = response.createdTimestamp - interaction.createdTimestamp;

		// Update with round-trip
		await interaction.editReply({
			flags: PING_FLAGS,
			components: [buildOverviewCard({ roundTrip, ...data }, interaction.user.id)]
		});
	}

	public override async messageRun(message: Message) {
		if (!message.channel.isSendable()) return;

		const data = await collectPingData();

		// Initial send
		const sent = await message.channel.send({
			flags: PING_FLAGS,
			components: [buildOverviewCard({ roundTrip: null, ...data }, message.author.id)]
		});

		// Calculate round-trip
		const roundTrip = sent.createdTimestamp - message.createdTimestamp;

		// Update with round-trip
		await sent.edit({
			flags: PING_FLAGS,
			components: [buildOverviewCard({ roundTrip, ...data }, message.author.id)]
		});
	}
}
