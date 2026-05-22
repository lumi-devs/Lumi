import { container } from '@sapphire/framework';
import type { ModuleMeta } from '#lib/module-system.js';
import { registerRpcHandler } from '#lib/rabbit.js';
import { resolver } from './lib/resolver.js';

export const meta: ModuleMeta = {
	name: 'downloader',
	displayName: 'Downloader',
	emoji: '📥',
	description: 'Manage third-party repositories and install community modules.',
	onLoad: () => {
		container.logger.info('[Downloader] Initializing RPC handlers...');

		// ── 1. Add Repository ────────────────────────────────────────────────
		registerRpcHandler('downloader.repo.add', async (req) => {
			const { data } = req;
			const { name, url, branch } = data as { name: string; url: string; branch?: string };

			if (!name || !url) throw new Error('Missing name or url');

			await resolver.addRepo(name, url, branch);

			// Save to DB
			const repo = await container.prisma.downloaderRepo.upsert({
				where: { name },
				update: { url, branch: branch || 'master' },
				create: { name, url, branch: branch || 'master' }
			});

			return { success: true, repo };
		});

		// ── 2. List Repositories ─────────────────────────────────────────────
		registerRpcHandler('downloader.repo.list', async () => {
			const repos = await container.prisma.downloaderRepo.findMany();
			return { repos };
		});

		// ── 3. List Modules in Repo ──────────────────────────────────────────
		registerRpcHandler('downloader.repo.modules', async (req) => {
			const { data } = req;
			const { repoName } = data as { repoName: string };

			if (!repoName) throw new Error('Missing repoName');

			const modules = await resolver.getModulesInRepo(repoName);

			// Get installed modules for this repo to indicate status
			const repo = await container.prisma.downloaderRepo.findUnique({
				where: { name: repoName },
				include: { installedModules: true }
			});

			const installedMap = new Set(repo?.installedModules.map((m) => m.moduleName) || []);

			return {
				repoName,
				modules: modules.map((m) => ({
					...m,
					isInstalled: installedMap.has(m.name)
				}))
			};
		});

		// ── 4. Install Module ────────────────────────────────────────────────
		registerRpcHandler('downloader.module.install', async (req) => {
			const { data } = req;
			const { repoName, moduleName } = data as { repoName: string; moduleName: string };

			if (!repoName || !moduleName) throw new Error('Missing repoName or moduleName');

			const repo = await container.prisma.downloaderRepo.findUnique({ where: { name: repoName } });
			if (!repo) throw new Error(`Repository ${repoName} not found in database.`);

			await resolver.installModule(repoName, moduleName);

			// Register as installed
			await container.prisma.downloaderModule.upsert({
				where: { repoId_moduleName: { repoId: repo.id, moduleName } },
				update: { installedAt: new Date() },
				create: { repoId: repo.id, moduleName }
			});

			// Tell ModuleManager to discover and load it
			await container.moduleManager.discover();
			await container.moduleManager.load(moduleName);

			return { success: true, moduleName };
		});

		// ── 5. Uninstall Module ──────────────────────────────────────────────
		registerRpcHandler('downloader.module.uninstall', async (req) => {
			const { data } = req;
			const { moduleName } = data as { moduleName: string };

			if (!moduleName) throw new Error('Missing moduleName');

			// Unload from runtime
			await container.moduleManager.unload(moduleName);

			// Remove symlink
			const fs = (await import('node:fs')).promises;
			const path = (await import('node:path')).default;
			const targetPath = path.join(process.cwd(), 'src', 'modules', moduleName);

			try {
				await fs.unlink(targetPath);
			} catch (err) {
				container.logger.warn(`[Downloader] Could not unlink ${targetPath}:`, err);
			}

			// Remove from DB
			await container.prisma.downloaderModule.deleteMany({
				where: { moduleName }
			});

			return { success: true, moduleName };
		});
	}
};
