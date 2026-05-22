import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry } from '@sapphire/framework';
import { EmberSubcommand } from '#lib/commands.js';
import { PermissionLevel } from '#lib/permissions.js';
import { MessageFlags } from 'discord.js';
import { ephemeralCard, makeSuccessCard, makeErrorCard } from '#lib/cards.js';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { resolver } from '../lib/resolver.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

@ApplyOptions<Subcommand.Options>({
	name: 'module',
	description: 'Manage installation of third-party modules',
	preconditions: ['GuildOnly', { name: 'MinimumPermissionLevel', context: { minimumPermissionLevel: PermissionLevel.BOT_OWNER } }],
	subcommands: [
		{ name: 'install', chatInputRun: 'chatInputInstall' },
		{ name: 'uninstall', chatInputRun: 'chatInputUninstall' }
	]
})
export class ModuleCommand extends EmberSubcommand {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName('module')
				.setDescription('Manage installation of third-party modules (Bot Owner Only)')
				.setDMPermission(false)
				.addSubcommand((sub) =>
					sub
						.setName('install')
						.setDescription('Install a module from an added repository')
						.addStringOption((opt) => opt.setName('repo').setDescription('The repository name').setRequired(true))
						.addStringOption((opt) => opt.setName('module').setDescription('The module name').setRequired(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('uninstall')
						.setDescription('Uninstall a third-party module')
						.addStringOption((opt) => opt.setName('module').setDescription('The module name').setRequired(true))
				)
		);
	}

	public async chatInputInstall(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const repoName = interaction.options.getString('repo', true);
		const moduleName = interaction.options.getString('module', true);

		try {
			const repo = await this.container.prisma.downloaderRepo.findUnique({ where: { name: repoName } });
			if (!repo) {
				await this.reply(
					interaction,
					ephemeralCard(makeErrorCard('Unknown Repository', `Repository **${repoName}** has not been added. Use \`/repo add\` first.`))
				);
				return;
			}

			await resolver.installModule(repoName, moduleName);

			await this.container.prisma.downloaderModule.upsert({
				where: { repoId_moduleName: { repoId: repo.id, moduleName } },
				update: { installedAt: new Date() },
				create: { repoId: repo.id, moduleName }
			});

			await this.container.moduleManager.discover();
			await this.container.moduleManager.load(moduleName);

			await this.reply(
				interaction,
				ephemeralCard(makeSuccessCard('Module Installed', `Successfully installed and loaded **${moduleName}** from **${repoName}**.`))
			);
		} catch (err) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Failed to Install Module', String(err))));
		}
	}

	public async chatInputUninstall(interaction: Subcommand.ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const moduleName = interaction.options.getString('module', true);

		try {
			const installed = await this.container.prisma.downloaderModule.findFirst({
				where: { moduleName }
			});

			if (!installed) {
				await this.reply(
					interaction,
					ephemeralCard(makeErrorCard('Unknown Module', `Module **${moduleName}** was not installed via the downloader.`))
				);
				return;
			}

			await this.container.moduleManager.unload(moduleName);

			const targetPath = path.join(process.cwd(), 'src', 'modules', moduleName);

			try {
				await fs.rm(targetPath, { recursive: true, force: true });
			} catch (err) {
				this.container.logger.error(`[ModuleCommand] failed to remove files:`, err);
			}

			await this.container.prisma.downloaderModule.delete({
				where: { repoId_moduleName: { repoId: installed.repoId, moduleName } }
			});

			await this.reply(interaction, ephemeralCard(makeSuccessCard('Module Uninstalled', `Successfully uninstalled **${moduleName}**.`)));
		} catch (err) {
			await this.reply(interaction, ephemeralCard(makeErrorCard('Failed to Uninstall Module', String(err))));
		}
	}
}
