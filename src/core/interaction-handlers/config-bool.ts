import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { StringSelectMenuInteraction } from 'discord.js';
import { makeSuccessCard, makeErrorCard } from '#utilities/cards.js';
import { writeModuleConfig } from '#database/settings/guild.js';

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.SelectMenu })
export class ConfigBoolHandler extends InteractionHandler {
	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.customId.startsWith('cfg:bool:')) return this.none();
		const [, , moduleName, key, guildId] = interaction.customId.split(':');
		if (!moduleName || !key || !guildId) return this.none();
		return this.some({ moduleName, key, guildId });
	}

	public async run(interaction: StringSelectMenuInteraction, { moduleName, key, guildId }: { moduleName: string; key: string; guildId: string }) {
		await interaction.deferUpdate();

		const value = interaction.values[0] === 'true';
		const record = this.container.moduleManager.get(moduleName);
		if (!record) {
			return interaction.editReply({
				...makeErrorCard('Unknown Module', `Module \`${moduleName}\` no longer exists.`),
				components: []
			});
		}
		const field = record.meta.configFields?.find((f) => f.key === key);
		if (!field) {
			return interaction.editReply({
				...makeErrorCard('Unknown Key', `Config key \`${key}\` is no longer valid.`),
				components: []
			});
		}

		await writeModuleConfig(guildId, moduleName, key, value);

		return interaction.editReply({
			...makeSuccessCard('Config Updated', `**${field.label}** set to \`${String(value)}\`.`),
			components: []
		});
	}
}
