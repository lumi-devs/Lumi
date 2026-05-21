import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry } from '@sapphire/framework';
import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, type AutocompleteInteraction } from 'discord.js';
import { EmberSubcommand } from '#lib/commands.js';
import { PermissionLevel } from '#lib/permissions.js';
import { MessageFlags } from 'discord.js';
import { ephemeralCard, makeSuccessCard, makeErrorCard, makeFieldsCard, makeInfoCard } from '#lib/cards.js';
import { FieldType, type ModuleMeta } from '#lib/module-system.js';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { readModuleConfig, writeModuleConfig, readModuleState, writeModuleState } from '#lib/database/settings.js';

@ApplyOptions<Subcommand.Options>({
	name: 'config',
	description: 'Manage bot configuration for this server',
	preconditions: ['GuildOnly', { name: 'MinimumPermissionLevel', context: { minimumPermissionLevel: PermissionLevel.GUILD_OWNER } }],
	subcommands: [
		{ name: 'list', chatInputRun: 'chatInputList' },
		{ name: 'get', chatInputRun: 'chatInputGet' },
		{ name: 'set', chatInputRun: 'chatInputSet' },
		{ name: 'enable', chatInputRun: 'chatInputEnable' },
		{ name: 'disable', chatInputRun: 'chatInputDisable' },
		{ name: 'global-enable', chatInputRun: 'chatInputGlobalEnable' },
		{ name: 'global-disable', chatInputRun: 'chatInputGlobalDisable' }
	]
})
export class ConfigCommand extends EmberSubcommand {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName('config')
				.setDescription('Manage bot configuration for this server')
				.setDMPermission(false)
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setDescription('List all modules or config fields for a specific module')
						.addStringOption((opt) =>
							opt.setName('module').setDescription('Module name to inspect').setRequired(false).setAutocomplete(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('get')
						.setDescription('Get the current value of a config field')
						.addStringOption((opt) => opt.setName('module').setDescription('Module name').setRequired(true).setAutocomplete(true))
						.addStringOption((opt) => opt.setName('key').setDescription('Config key').setRequired(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('set')
						.setDescription('Set a config field value')
						.addStringOption((opt) => opt.setName('module').setDescription('Module name').setRequired(true).setAutocomplete(true))
						.addStringOption((opt) => opt.setName('key').setDescription('Config key').setRequired(true))
						.addStringOption((opt) => opt.setName('value').setDescription('New value (channel/role: mention or ID)').setRequired(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('enable')
						.setDescription('Enable a module for this server')
						.addStringOption((opt) => opt.setName('module').setDescription('Module name').setRequired(true).setAutocomplete(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('disable')
						.setDescription('Disable a module for this server')
						.addStringOption((opt) => opt.setName('module').setDescription('Module name').setRequired(true).setAutocomplete(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('global-enable')
						.setDescription('Globally enable a module (bot owner only)')
						.addStringOption((opt) => opt.setName('module').setDescription('Module name').setRequired(true).setAutocomplete(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('global-disable')
						.setDescription('Globally disable a module (bot owner only)')
						.addStringOption((opt) => opt.setName('module').setDescription('Module name').setRequired(true).setAutocomplete(true))
				)
		);
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction): Promise<void> {
		const focused = interaction.options.getFocused().toLowerCase();
		const choices = this.container.moduleManager
			.all()
			.filter((r) => r.meta.name.toLowerCase().includes(focused) || r.meta.displayName.toLowerCase().includes(focused))
			.slice(0, 25)
			.map((r) => ({ name: `${r.meta.emoji} ${r.meta.displayName}`, value: r.meta.name }));
		await interaction.respond(choices);
	}

	// ── Subcommand handlers ───────────────────────────────────────────────────

	public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const guildId = interaction.guild!.id;
		const moduleName = interaction.options.getString('module');
		if (!moduleName) return this.#listAllModules(interaction, guildId);

		const meta = this.container.moduleManager.get(moduleName)?.meta;
		if (!meta) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Unknown Module', `No module named \`${moduleName}\` is registered.`)));
			return;
		}
		await this.#listModuleFields(interaction, guildId, meta);
	}

	public async chatInputGet(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const guildId = interaction.guild!.id;
		const moduleName = interaction.options.getString('module', true);
		const key = interaction.options.getString('key', true);

		const meta = this.container.moduleManager.get(moduleName)?.meta;
		if (!meta) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Unknown Module', `No module named \`${moduleName}\`.`)));
			return;
		}
		const field = meta.configFields?.find((f) => f.key === key);
		if (!field) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Unknown Key', `\`${key}\` is not a valid config key for **${meta.displayName}**.`)));
			return;
		}

		const value = await readModuleConfig(guildId, moduleName, key);
		const display = value === undefined || value === null ? field.default ?? '*not set*' : String(value);

		await this.reply(
			interaction,
			ephemeralCard(makeInfoCard(`${meta.emoji} ${meta.displayName} › \`${key}\``, `**${field.label}**: ${display}`, { footer: `Type: ${field.type}` }))
		);
	}

	public async chatInputSet(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const guildId = interaction.guild!.id;
		const moduleName = interaction.options.getString('module', true);
		const key = interaction.options.getString('key', true);
		const rawValue = interaction.options.getString('value', true);

		const meta = this.container.moduleManager.get(moduleName)?.meta;
		if (!meta) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Unknown Module', `No module named \`${moduleName}\`.`)));
			return;
		}
		const field = meta.configFields?.find((f) => f.key === key);
		if (!field) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Unknown Key', `\`${key}\` is not a valid config key for **${meta.displayName}**.`)));
			return;
		}

		if (field.type === FieldType.BOOLEAN) {
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`cfg:bool:${moduleName}:${key}:${guildId}`)
					.setPlaceholder('Choose a value')
					.addOptions(
						new StringSelectMenuOptionBuilder().setLabel('True').setValue('true'),
						new StringSelectMenuOptionBuilder().setLabel('False').setValue('false')
					)
			);
			await this.reply(
				interaction,
				ephemeralCard(makeInfoCard('Choose a value', `Setting **${field.label}** for **${meta.displayName}**`, { actionRows: [row] }))
			);
			return;
		}

		const coerced = this.#coerce(rawValue, field.type, field.choices);
		if (coerced === null) {
			const hint = field.type === FieldType.ENUM ? `Valid choices: ${field.choices!.join(', ')}` : `Expected a valid ${field.type}.`;
			await this.reply(interaction, ephemeralCard(makeErrorCard('Invalid Value', hint)));
			return;
		}

		await writeModuleConfig(guildId, moduleName, key, coerced);
		await this.reply(
			interaction,
			ephemeralCard(makeSuccessCard('Config Updated', `**${field.label}** set to \`${String(coerced)}\`.`))
		);
	}

	public async chatInputEnable(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		return this.#toggle(interaction, true);
	}

	public async chatInputDisable(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		return this.#toggle(interaction, false);
	}

	public async chatInputGlobalEnable(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		return this.#globalToggle(interaction, true);
	}

	public async chatInputGlobalDisable(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		return this.#globalToggle(interaction, false);
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	async #listAllModules(interaction: Subcommand.ChatInputCommandInteraction, guildId: string): Promise<void> {
		const allModules = this.container.moduleManager.all().map((r) => r.meta);
		const fields = await Promise.all(
			allModules.map(async (m) => {
				const enabled = await readModuleState(guildId, m.name);
				return {
					name: `${m.emoji} ${m.displayName}`,
					value: `${enabled ? '✅ Enabled' : '❌ Disabled'}\n\`/config list module:${m.name}\``
				};
			})
		);

		await this.reply(interaction, ephemeralCard(makeFieldsCard('Server Modules', fields)));
	}

	async #listModuleFields(interaction: Subcommand.ChatInputCommandInteraction, guildId: string, meta: ModuleMeta): Promise<void> {
		const fields = meta.configFields ?? [];
		if (fields.length === 0) {
			await this.reply(
				interaction,
				ephemeralCard(makeInfoCard(`${meta.emoji} ${meta.displayName}`, 'This module has no configurable fields.'))
			);
			return;
		}

		const uiFields = await Promise.all(
			fields.map(async (f) => {
				const value = await readModuleConfig(guildId, meta.name, f.key);
				const display = value === undefined || value === null ? f.default ?? '*not set*' : String(value);
				return {
					name: f.label,
					value: `\`${f.key}\`: ${display}\n*Type: ${f.type}*`
				};
			})
		);

		await this.reply(
			interaction,
			ephemeralCard(makeFieldsCard(`${meta.emoji} ${meta.displayName} Configuration`, uiFields))
		);
	}

	async #globalToggle(interaction: Subcommand.ChatInputCommandInteraction, enable: boolean): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const moduleName = interaction.options.getString('module', true);
		if (moduleName === 'core') {
			await this.reply(
				interaction,
				ephemeralCard(makeErrorCard('Cannot Toggle Core', 'The `core` module is required and cannot be enabled or disabled.'))
			);
			return;
		}
		const meta = this.container.moduleManager.get(moduleName)?.meta;
		if (!meta) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Unknown Module', `No module named \`${moduleName}\`.`)));
			return;
		}
		await this.container.moduleManager.setEnabled(moduleName, enable);
		const verb = enable ? 'enabled' : 'disabled';
		await this.reply(
			interaction,
			ephemeralCard(
				makeSuccessCard(
					`Module Globally ${enable ? 'Enabled' : 'Disabled'}`,
					`**${meta.emoji} ${meta.displayName}** is now globally ${verb}.`
				)
			)
		);
	}

	async #toggle(interaction: Subcommand.ChatInputCommandInteraction, enable: boolean): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const guildId = interaction.guild!.id;
		const moduleName = interaction.options.getString('module', true);
		const meta = this.container.moduleManager.get(moduleName)?.meta;
		if (!meta) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Unknown Module', `No module named \`${moduleName}\`.`)));
			return;
		}

		const currentEnabled = await readModuleState(guildId, moduleName);
		if (currentEnabled === enable) {
			const verb = enable ? 'enabled' : 'disabled';
			await this.reply(
				interaction,
				ephemeralCard(makeInfoCard(`Already ${enable ? 'Enabled' : 'Disabled'}`, `**${meta.emoji} ${meta.displayName}** is already ${verb} in this server.`))
			);
			return;
		}

		await writeModuleState(guildId, moduleName, enable);
		const verb = enable ? 'enabled' : 'disabled';
		await this.reply(
			interaction,
			ephemeralCard(
				makeSuccessCard(
					`Module ${enable ? 'Enabled' : 'Disabled'}`,
					`**${meta.emoji} ${meta.displayName}** has been ${verb} for this server.`
				)
			)
		);
	}

	#coerce(value: string, type: FieldType, choices?: string[]): any {
		switch (type) {
			case FieldType.BOOLEAN:
				return value.toLowerCase() === 'true';
			case FieldType.NUMBER: {
				const n = Number(value);
				return isNaN(n) ? null : n;
			}
			case FieldType.ENUM:
				return choices?.includes(value) ? value : null;
			case FieldType.CHANNEL:
			case FieldType.ROLE:
			case FieldType.USER: {
				const cleaned = value.replace(/[<@&#!>]/g, '');
				return /^\d{17,20}$/.test(cleaned) ? cleaned : null;
			}
			default:
				return value;
		}
	}
}
