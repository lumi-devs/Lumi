import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { EmberSubcommand } from '#lib/commands.js';
import { PermissionLevel, type PermissionModelType } from '#lib/permissions.js';
import { MessageFlags } from 'discord.js';
import { ephemeralCard, makeListCard } from '#lib/cards.js';
import { RedisKeys } from '#lib/redis.js';

const MODEL_TYPES = ['role', 'user', 'channel', 'category', 'everyone'] as const satisfies readonly PermissionModelType[];
type ModelType = (typeof MODEL_TYPES)[number];

function parseTarget(raw: string | null, type: ModelType): string {
	if (type === 'everyone') return '0';
	if (!raw) throw new Error('target is required for non-everyone overrides');
	const cleaned = raw.replace(/[<@&#!>]/g, '');
	if (!/^\d{1,20}$/.test(cleaned)) throw new Error('invalid snowflake');
	return cleaned;
}

function formatOverride(row: any): string {
	const emoji = row.allow ? '✅' : '❌';
	let mention: string;
	if (row.modelType === 'everyone') mention = '@everyone';
	else if (row.modelType === 'role') mention = `<@&${row.modelId}>`;
	else if (row.modelType === 'user') mention = `<@${row.modelId}>`;
	else if (row.modelType === 'category') mention = `category <#${row.modelId}>`;
	else mention = `<#${row.modelId}>`;
	return `${emoji} \`${row.commandPath}\` — ${row.modelType} ${mention}`;
}

@ApplyOptions<Subcommand.Options>({
	name: 'permissions',
	description: 'Manage command permission overrides for this guild.',
	preconditions: ['GuildOnly', { name: 'MinimumPermissionLevel', context: { minimumPermissionLevel: PermissionLevel.ADMIN } }],
	subcommands: [
		{ name: 'allow', chatInputRun: 'chatInputAllow' },
		{ name: 'deny', chatInputRun: 'chatInputDeny' },
		{ name: 'reset', chatInputRun: 'chatInputReset' },
		{ name: 'list', chatInputRun: 'chatInputList' }
	]
})
export class PermissionsCommand extends EmberSubcommand {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName('permissions')
				.setDescription('Manage command permission overrides for this guild.')
				.addSubcommand((sub) =>
					sub
						.setName('allow')
						.setDescription('Add an allow override for a command.')
						.addStringOption((o) =>
							o.setName('command_path').setDescription('Command path e.g. birthday:birthday:set or birthday:*').setRequired(true)
						)
						.addStringOption((o) =>
							o
								.setName('type')
								.setDescription('Target type')
								.setRequired(true)
								.addChoices(
									{ name: 'Role', value: 'role' },
									{ name: 'User', value: 'user' },
									{ name: 'Channel', value: 'channel' },
									{ name: 'Category', value: 'category' },
									{ name: 'Everyone', value: 'everyone' }
								)
						)
						.addStringOption((o) =>
							o.setName('target').setDescription('Mention or snowflake ID (not needed for everyone)').setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('deny')
						.setDescription('Add a deny override for a command.')
						.addStringOption((o) =>
							o.setName('command_path').setDescription('Command path e.g. birthday:birthday:set or birthday:*').setRequired(true)
						)
						.addStringOption((o) =>
							o
								.setName('type')
								.setDescription('Target type')
								.setRequired(true)
								.addChoices(
									{ name: 'Role', value: 'role' },
									{ name: 'User', value: 'user' },
									{ name: 'Channel', value: 'channel' },
									{ name: 'Category', value: 'category' },
									{ name: 'Everyone', value: 'everyone' }
								)
						)
						.addStringOption((o) =>
							o.setName('target').setDescription('Mention or snowflake ID (not needed for everyone)').setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('reset')
						.setDescription('Remove one or all overrides for a command.')
						.addStringOption((o) => o.setName('command_path').setDescription('Command path to reset overrides for').setRequired(true))
						.addStringOption((o) =>
							o
								.setName('type')
								.setDescription('Target type (omit to remove all for this command)')
								.setRequired(false)
								.addChoices(
									{ name: 'Role', value: 'role' },
									{ name: 'User', value: 'user' },
									{ name: 'Channel', value: 'channel' },
									{ name: 'Category', value: 'category' },
									{ name: 'Everyone', value: 'everyone' }
								)
						)
						.addStringOption((o) => o.setName('target').setDescription('Mention or snowflake ID').setRequired(false))
				)
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setDescription('List permission overrides for this guild.')
						.addStringOption((o) => o.setName('command_path').setDescription('Filter by command path').setRequired(false))
				)
		);
	}

	public async chatInputAllow(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		return this.#write(interaction, true);
	}

	public async chatInputDeny(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		return this.#write(interaction, false);
	}

	public async chatInputReset(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const commandPath = interaction.options.getString('command_path', true);
		const type = interaction.options.getString('type', false) as ModelType | null;
		const targetRaw = interaction.options.getString('target', false);
		const guildId = interaction.guildId!;

		let deleted: number;
		if (type) {
			let targetId: string;
			try {
				targetId = parseTarget(targetRaw, type);
			} catch {
				await this.replyError(interaction, 'Invalid target', 'Provide a valid mention or snowflake ID.');
				return;
			}
			const result = await this.container.prisma.permissionOverride.deleteMany({
				where: { guildId, commandPath, modelType: type, modelId: targetId }
			});
			deleted = result.count;
		} else {
			const result = await this.container.prisma.permissionOverride.deleteMany({
				where: { guildId, commandPath }
			});
			deleted = result.count;
		}

		await this.container.redis.del(RedisKeys.permOverrides(commandPath, guildId));

		if (deleted === 0) {
			await this.replyWarning(interaction, 'Nothing removed', 'No matching overrides were found.');
			return;
		}
		await this.replySuccess(interaction, 'Overrides reset', `Removed **${deleted}** override${deleted === 1 ? '' : 's'} for \`${commandPath}\`.`);
	}

	public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const commandPath = interaction.options.getString('command_path', false);
		const guildId = interaction.guildId!;
		const settings = await this.container.prisma.permissionOverride.findMany({
			where: { guildId, commandPath: commandPath ?? undefined }
		});
		const title = commandPath ? `Overrides for \`${commandPath}\`` : 'Permission Overrides';
		await this.reply(interaction, ephemeralCard(makeListCard(title, settings.map(formatOverride))));
	}

	async #write(interaction: Subcommand.ChatInputCommandInteraction, allow: boolean): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const commandPath = interaction.options.getString('command_path', true);
		const type = interaction.options.getString('type', true) as ModelType;
		const targetRaw = interaction.options.getString('target', false);

		let targetId: string;
		try {
			targetId = parseTarget(targetRaw, type);
		} catch {
			await this.replyError(interaction, 'Invalid target', 'Provide a valid mention or snowflake ID.');
			return;
		}

		const guildId = interaction.guildId!;
		await this.container.prisma.permissionOverride.upsert({
			where: {
				guildId_commandPath_modelType_modelId: {
					guildId,
					commandPath,
					modelType: type,
					modelId: targetId
				}
			},
			update: { allow },
			create: { guildId, commandPath, modelType: type, modelId: targetId, allow }
		});
		await this.container.redis.del(RedisKeys.permOverrides(commandPath, guildId));

		const verb = allow ? 'allowed' : 'denied';
		await this.replySuccess(
			interaction,
			`Override ${verb}`,
			`\`${commandPath}\` is now **${verb}** for ${type === 'everyone' ? '@everyone' : `the specified ${type}`}.`
		);
	}
}
