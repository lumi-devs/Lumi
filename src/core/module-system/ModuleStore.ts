import { Store, container } from '@sapphire/framework';
import { Module } from './Module.js';

export class ModuleStore extends Store<Module> {
	public constructor() {
		super(Module, { name: 'modules' });
	}

	public override async loadAll(): Promise<void> {
		await super.loadAll();

		try {
			const states = await container.prisma.globalModuleState.findMany();
			const stateMap = new Map(states.map((s) => [s.moduleName, s.enabled]));

			for (const module of this.values()) {
				if (module.isCore) {
					module.enabled = true;
					continue;
				}

				const dbEnabled = stateMap.get(module.name);
				if (dbEnabled === undefined) {
					module.enabled = true;
				} else {
					module.enabled = dbEnabled;
				}
			}
		} catch (err) {
			container.logger.error('[ModuleStore] Failed to load module states from database:', err);
		}
	}

	public async setEnabled(name: string, enabled: boolean, reason?: string): Promise<void> {
		const module = this.get(name);
		if (!module) throw new Error(`Unknown module: ${name}`);
		if (module.isCore && !enabled) throw new Error('Cannot disable the Core module');

		module.enabled = enabled;

		await container.prisma.globalModuleState.upsert({
			where: { moduleName: name },
			update: { enabled, reason: reason ?? null },
			create: { moduleName: name, enabled, reason: reason ?? null }
		});
	}

	public isEnabled(name: string): boolean {
		return this.get(name)?.enabled ?? false;
	}
}

declare module '@sapphire/framework' {
	interface StoreRegistryEntries {
		modules: ModuleStore;
	}
}
