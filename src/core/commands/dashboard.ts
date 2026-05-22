import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { EmberSubcommand } from '#lib/commands.js';
import { PermissionLevel } from '#lib/permissions.js';
import { MessageFlags } from 'discord.js';
import { ephemeralCard, makeSuccessCard, makeErrorCard } from '#utilities/cards.js';
import { writeModuleConfig } from '#database/settings/guild.js';

@ApplyOptions<Subcommand.Options>({
	name: 'dashboard',
	description: 'Manage dashboard configuration and layout',
	preconditions: ['GuildOnly', { name: 'MinimumPermissionLevel', context: { minimumPermissionLevel: PermissionLevel.GUILD_OWNER } }],
	subcommands: [{ name: 'layout', chatInputRun: 'chatInputLayout' }]
})
export class DashboardCommand extends EmberSubcommand {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName('dashboard')
				.setDescription('Manage dashboard configuration and layout')
				.setDMPermission(false)
				.addSubcommand((sub) =>
					sub
						.setName('layout')
						.setDescription('Set the widget layout for the dashboard')
						.addStringOption((opt) => opt.setName('layout').setDescription('JSON array of module widgets').setRequired(true))
				)
		);
	}

	public async chatInputLayout(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const guildId = interaction.guild!.id;
		const rawLayout = interaction.options.getString('layout', true);

		let layout;
		try {
			layout = JSON.parse(rawLayout);
			if (!Array.isArray(layout)) throw new Error('Layout must be a JSON array');
		} catch (err) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Invalid JSON', 'The layout must be a valid JSON array of widget names.')));
			return;
		}

		// Store layout in core module config
		await writeModuleConfig(guildId, 'core', 'dashboard_layout', layout);

		// Broadcast layout change to dashboard via SSE (RabbitMQ fanout)
		if (this.container.rabbit) {
			await this.container.rabbit.publishEvent('dashboard.layout.updated', {
				guildId,
				layout
			});
		}

		await this.reply(
			interaction,
			ephemeralCard(makeSuccessCard('Layout Updated', `Dashboard layout updated successfully to: \`${JSON.stringify(layout)}\``))
		);
	}
}
