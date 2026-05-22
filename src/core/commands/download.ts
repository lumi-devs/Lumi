import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { EmberCommand } from '#lib/commands.js';
import { PermissionLevel } from '#lib/permissions.js';
import { makeSuccessCard, makeErrorCard } from '#utilities/cards.js';
import { resolver } from '../lib/downloader/resolver.js';

@ApplyOptions<Command.Options>({
	name: 'download',
	aliases: ['dl'],
	description: 'Install a module from a repository (Bot Owner Only)',
	preconditions: [{ name: 'MinimumPermissionLevel', context: { minimumPermissionLevel: PermissionLevel.BOT_OWNER } }]
})
export class DownloadCommand extends EmberCommand {
	public override async messageRun(message: Message, args: Args): Promise<void> {
		const repoName = await args.pick('string').catch(() => null);
		const moduleName = await args.pick('string').catch(() => null);

		if (!repoName || !moduleName) {
			await message.reply({ ...makeErrorCard('Missing Arguments', 'Usage: `,download <repo> <module>`') });
			return;
		}

		try {
			const repo = await this.container.prisma.downloaderRepo.findUnique({ where: { name: repoName } });
			if (!repo) {
				await message.reply({
					...makeErrorCard('Unknown Repository', `Repository **${repoName}** has not been added. Use \`,repo add\` first.`)
				});
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

			await message.reply({
				...makeSuccessCard('Module Installed', `Successfully installed and loaded **${moduleName}** from **${repoName}**.`)
			});
		} catch (err) {
			await message.reply({ ...makeErrorCard('Failed to Install Module', String(err)) });
		}
	}
}
