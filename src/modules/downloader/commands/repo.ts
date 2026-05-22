import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry } from '@sapphire/framework';
import { EmberSubcommand } from '#lib/commands.js';
import { PermissionLevel } from '#lib/permissions.js';
import { MessageFlags } from 'discord.js';
import { ephemeralCard, makeSuccessCard, makeErrorCard, makeListCard } from '#lib/cards.js';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { resolver } from '../lib/resolver.js';

@ApplyOptions<Subcommand.Options>({
	name: 'repo',
	description: 'Manage third-party module repositories',
	preconditions: ['GuildOnly', { name: 'MinimumPermissionLevel', context: { minimumPermissionLevel: PermissionLevel.BOT_OWNER } }],
	subcommands: [
		{ name: 'add', chatInputRun: 'chatInputAdd' },
		{ name: 'list', chatInputRun: 'chatInputList' },
		{ name: 'modules', chatInputRun: 'chatInputModules' }
	]
})
export class RepoCommand extends EmberSubcommand {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName('repo')
				.setDescription('Manage third-party module repositories (Bot Owner Only)')
				.setDMPermission(false)
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setDescription('Add a new module repository')
						.addStringOption((opt) => opt.setName('name').setDescription('A unique name for this repo').setRequired(true))
						.addStringOption((opt) => opt.setName('url').setDescription('The Git URL of the repository').setRequired(true))
						.addStringOption((opt) => opt.setName('branch').setDescription('Branch to track (default: master)').setRequired(false))
				)
				.addSubcommand((sub) => sub.setName('list').setDescription('List all added repositories'))
				.addSubcommand((sub) =>
					sub
						.setName('modules')
						.setDescription('List all discoverable modules within a repository')
						.addStringOption((opt) => opt.setName('repo').setDescription('The repository name').setRequired(true))
				)
		);
	}

	public async chatInputAdd(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const name = interaction.options.getString('name', true);
		const url = interaction.options.getString('url', true);
		const branch = interaction.options.getString('branch') ?? 'master';

		try {
			await resolver.addRepo(name, url, branch);

			await this.container.prisma.downloaderRepo.upsert({
				where: { name },
				update: { url, branch },
				create: { name, url, branch }
			});

			await this.reply(
				interaction,
				ephemeralCard(
					makeSuccessCard(
						'Repository Added',
						`Successfully cloned/updated repository **${name}**.\nYou can now use \`/repo modules repo:${name}\` to view available modules.`
					)
				)
			);
		} catch (err) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Failed to Add Repository', String(err))));
		}
	}

	public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const repos = await this.container.prisma.downloaderRepo.findMany();
		if (!repos.length) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('No Repositories', 'No third-party repositories have been added yet.')));
			return;
		}

		const list = repos.map((r) => `**${r.name}** (\`${r.branch}\`)\n<${r.url}>`);
		await this.reply(interaction, ephemeralCard(makeListCard('Added Repositories', list)));
	}

	public async chatInputModules(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const repoName = interaction.options.getString('repo', true);

		try {
			const modules = await resolver.getModulesInRepo(repoName);

			if (!modules.length) {
				await this.reply(
					interaction,
					ephemeralCard(
						makeErrorCard('No Modules Found', `Repository **${repoName}** contains no discoverable modules with an \`info.json\` file.`)
					)
				);
				return;
			}

			const list = modules.map((m) => `**${m.name}** (v${m.version})\n*${m.short}*`);
			await this.reply(interaction, ephemeralCard(makeListCard(`Modules in ${repoName}`, list)));
		} catch (err) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Failed to Read Repository', String(err))));
		}
	}
}
