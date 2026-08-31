import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@sapphire/framework';
import { promises as fs } from 'node:fs';
import path from 'node:path';

vi.mock('#lib/module-system/manifest.js', () => ({
	readManifest: vi.fn(),
	metaFromManifest: vi.fn()
}));

import { readManifest, metaFromManifest } from '#lib/module-system/manifest.js';

const mockedReadManifest = vi.mocked(readManifest);
const mockedMetaFromManifest = vi.mocked(metaFromManifest);

import { ModuleStore } from '#lib/module-system/ModuleStore.js';

type ModSpec = {
	dependencies?: string[];
	conflicts?: string[];
	isCore?: boolean;
	disableable?: boolean;
};

/**
 * Wire the mocked FS + manifest layer so `discover()` finds one module dir per
 * key under /test/modules. `order` sets the readdir order (to exercise topo sort).
 */
function setupModules(mods: Record<string, ModSpec>, order: string[] = Object.keys(mods)) {
	const names = Object.keys(mods);
	vi.spyOn(fs, 'access').mockResolvedValue(undefined);
	vi.spyOn(fs, 'readdir').mockImplementation(
		(p: any) =>
			Promise.resolve(names.includes(path.basename(String(p))) ? [] : order) as any
	);
	vi.spyOn(fs, 'stat').mockImplementation(
		(p: any) =>
			Promise.resolve({
				isDirectory: () => names.includes(path.basename(String(p))),
				isFile: () => false
			}) as any
	);
	mockedReadManifest.mockImplementation((dir: string) => {
		const name = path.basename(dir);
		if (!names.includes(name)) return Promise.resolve(null);
		return Promise.resolve({
			name,
			displayName: name,
			emoji: '',
			description: '',
			version: '0.0.0',
			targetUtility: 'worker' as const,
			subStores: [],
			configFields: [],
			...mods[name]
		});
	});
}

describe('ModuleStore', () => {
	let store: any;

	beforeEach(() => {
		vi.restoreAllMocks();
		mockedMetaFromManifest.mockImplementation((m: any) => ({
			name: m.name,
			displayName: m.name,
			emoji: '',
			description: '',
			version: '0.0.0',
			dependencies: m.dependencies ?? [],
			conflicts: m.conflicts ?? [],
			disableable: m.disableable
		}));

		// DatabaseService is namespaced - ModuleStore reads via container.db.modules.*
		(container as any).db = {
			modules: {
				getGlobalModuleStates: vi.fn().mockResolvedValue(new Map()),
				isModuleGlobalEnabled: vi.fn(),
				setModuleGlobalEnabled: vi.fn()
			}
		} as any;
		container.stores = { registerPath: vi.fn() } as any;
		container.logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

		store = new ModuleStore();
		store.addRoot(new URL('file:///test/modules'));
	});

	it('should discover modules in a root directory', async () => {
		setupModules({ afk: {}, raids: {} });
		await store.discover();

		expect(store.getRecord('afk')).toBeDefined();
		expect(store.getRecord('raids')).toBeDefined();
		expect(container.stores.registerPath).toHaveBeenCalledTimes(2);
	});

	it('should handle topological sort for dependencies', async () => {
		// Discovered b-first; topo must still register a before b.
		setupModules({ b: { dependencies: ['a'] }, a: {} }, ['b', 'a']);
		await store.discover();

		const order = (container.stores.registerPath as any).mock.calls.map((c: any[]) =>
			path.basename(String(c[0]))
		);
		expect(order).toEqual(['a', 'b']);
	});

	it('disables (but does not throw for) modules with a circular dependency', async () => {
		setupModules({ a: { dependencies: ['b'] }, b: { dependencies: ['a'] } });
		await expect(store.discover()).resolves.toBeUndefined();

		expect(store.getRecord('a').enabled).toBe(false);
		expect(store.getRecord('a').state).toBe('failed');
		expect(store.getRecord('b').enabled).toBe(false);
		expect(store.getRecord('b').state).toBe('failed');
		expect(container.logger.error).toHaveBeenCalledWith(
			expect.stringContaining('Circular dependency')
		);
	});

	it('disables only the module with a missing dependency, leaving unrelated modules loaded', async () => {
		setupModules({ a: {}, b: { dependencies: ['ghost'] } });
		await store.discover();

		expect(store.getRecord('a').enabled).toBe(true);
		expect(store.getRecord('b').enabled).toBe(false);
		expect(store.getRecord('b').state).toBe('failed');
		expect(store.getRecord('b').failureReason).toMatch(/missing dependency 'ghost'/);
		expect(container.stores.registerPath).toHaveBeenCalledTimes(1);
	});

	it('transitively disables modules that depend on a broken module', async () => {
		// c -> b -> a, and a has a missing dependency. b and c must both be disabled.
		setupModules({ a: { dependencies: ['ghost'] }, b: { dependencies: ['a'] }, c: { dependencies: ['b'] } });
		await store.discover();

		expect(store.getRecord('a').enabled).toBe(false);
		expect(store.getRecord('b').enabled).toBe(false);
		expect(store.getRecord('c').enabled).toBe(false);
		expect(container.stores.registerPath).not.toHaveBeenCalled();
	});

	it('should handle conflicts', async () => {
		setupModules({ a: { conflicts: ['b'] }, b: {} });
		await store.discover();

		expect(store.getRecord('a').enabled).toBe(true);
		expect(store.getRecord('b').enabled).toBe(false);
	});

	it('should fail module load when any owned piece fails to load', async () => {
		setupModules({ broken: {} });
		await store.discover();

		const failingStore = {
			name: 'commands',
			load: vi.fn().mockRejectedValue(new Error('bad command')),
			values: vi.fn().mockReturnValue([]),
			paths: new Set()
		};
		container.stores = {
			values: vi.fn().mockReturnValue([failingStore]),
			get: vi.fn()
		} as any;
		(fs.readdir as any).mockImplementation((p: any, opts: any) => {
			const parts = String(p).split(path.sep);
			if (parts.at(-1) === 'commands') {
				if (opts?.withFileTypes) {
					return Promise.resolve([{ name: 'bad.ts', isDirectory: () => false, isFile: () => true }]);
				}
				return Promise.resolve(['bad.ts']);
			}
			return Promise.resolve(['broken']);
		});

		await expect(store.loadModule('broken')).rejects.toThrow(/bad command/);
		expect(store.getRecord('broken').state).toBe('failed');
		expect(store.getRecord('broken').enabled).toBe(false);
	});

	describe('setEnabled', () => {
		it('enables a disabled module by loading it and persisting the new state', async () => {
			container.db.modules.getGlobalModuleStates = vi.fn().mockResolvedValue(new Map([['afk', false]]));
			setupModules({ afk: {} });
			await store.discover();
			expect(store.getRecord('afk').enabled).toBe(false);

			const loadModuleSpy = vi.spyOn(store, 'loadModule').mockResolvedValue(undefined);

			await store.setEnabled('afk', true, 'admin turned it on');

			expect(loadModuleSpy).toHaveBeenCalledWith('afk');
			expect(container.db.modules.setModuleGlobalEnabled).toHaveBeenCalledWith(
				'afk',
				true,
				'admin turned it on'
			);
			expect(store.getRecord('afk').enabled).toBe(true);
			expect(store.getRecord('afk').state).toBe('loaded');
		});

		it('disables an enabled module by unloading it and persisting the new state', async () => {
			setupModules({ afk: {} });
			await store.discover();
			expect(store.getRecord('afk').enabled).toBe(true);

			const unloadSpy = vi.spyOn(store, 'unload').mockResolvedValue({} as any);

			await store.setEnabled('afk', false, 'abuse');

			expect(unloadSpy).toHaveBeenCalledWith('afk');
			expect(container.db.modules.setModuleGlobalEnabled).toHaveBeenCalledWith('afk', false, 'abuse');
			expect(store.getRecord('afk').enabled).toBe(false);
			expect(store.getRecord('afk').state).toBe('disabled');
		});

		it('throws when disabling a module that is not disableable (essential)', async () => {
			setupModules({ core: { disableable: false } });
			await store.discover();

			await expect(store.setEnabled('core', false)).rejects.toThrow(
				/essential and cannot be disabled/
			);
			expect(container.db.modules.setModuleGlobalEnabled).not.toHaveBeenCalled();
		});

		it('is a no-op when the module is already in the desired state', async () => {
			setupModules({ afk: {} });
			await store.discover();
			expect(store.getRecord('afk').enabled).toBe(true);

			const loadModuleSpy = vi.spyOn(store, 'loadModule');
			const unloadSpy = vi.spyOn(store, 'unload');

			await store.setEnabled('afk', true);

			expect(loadModuleSpy).not.toHaveBeenCalled();
			expect(unloadSpy).not.toHaveBeenCalled();
			expect(container.db.modules.setModuleGlobalEnabled).not.toHaveBeenCalled();
		});

		it('throws for an unknown module', async () => {
			await expect(store.setEnabled('does-not-exist', true)).rejects.toThrow(/Unknown module/);
		});

		it('serializes concurrent calls for the same module instead of double-loading it', async () => {
			container.db.modules.getGlobalModuleStates = vi.fn().mockResolvedValue(new Map([['afk', false]]));
			setupModules({ afk: {} });
			await store.discover();
			expect(store.getRecord('afk').enabled).toBe(false);

			// Resolve loadModule only after both setEnabled() calls have started,
			// so their check-then-act on record.enabled has a real chance to
			// interleave if setEnabled isn't serialized per-module.
			let releaseLoad: () => void = () => {};
			const loadGate = new Promise<void>((resolve) => {
				releaseLoad = resolve;
			});
			const loadModuleSpy = vi.spyOn(store, 'loadModule').mockImplementation(() => loadGate);

			const first = store.setEnabled('afk', true, 'admin A');
			const second = store.setEnabled('afk', true, 'admin B');
			await Promise.resolve(); // let both calls reach their await points
			releaseLoad();
			await Promise.all([first, second]);

			expect(loadModuleSpy).toHaveBeenCalledTimes(1);
			expect(container.db.modules.setModuleGlobalEnabled).toHaveBeenCalledTimes(1);
			expect(store.getRecord('afk').enabled).toBe(true);
		});
	});

	describe('reload', () => {
		it('serializes overlapping reload() calls instead of interleaving unload/discover/loadModule', async () => {
			setupModules({ afk: {} });
			await store.discover();

			const order: string[] = [];
			let releaseFirstLoad: () => void = () => {};
			const firstLoadGate = new Promise<void>((resolve) => {
				releaseFirstLoad = resolve;
			});
			let loadModuleCalls = 0;

			vi.spyOn(store, 'unload').mockImplementation((n: any) => {
				order.push(`unload:${n}`);
				return Promise.resolve({} as any);
			});
			vi.spyOn(store, 'discover').mockImplementation(() => {
				order.push('discover');
				return Promise.resolve();
			});
			vi.spyOn(store, 'loadModule').mockImplementation(async (n: any) => {
				loadModuleCalls += 1;
				order.push(`loadModule:${n}:start`);
				if (loadModuleCalls === 1) await firstLoadGate;
				order.push(`loadModule:${n}:end`);
			});

			const first = store.reload('afk');
			const second = store.reload('afk');
			// Give the first call's chain a chance to reach (and block on)
			// loadModule. If reload() isn't serialized, the second call's
			// unload()/discover() would already be interleaved in `order` here.
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			expect(order).toEqual(['unload:afk', 'discover', 'loadModule:afk:start']);

			releaseFirstLoad();
			await Promise.all([first, second]);

			expect(order).toEqual([
				'unload:afk',
				'discover',
				'loadModule:afk:start',
				'loadModule:afk:end',
				'unload:afk',
				'discover',
				'loadModule:afk:start',
				'loadModule:afk:end',
			]);
		});
	});

	describe('unload', () => {
		it('unloads owned pieces from every other store and marks the module disabled when its directory still exists', async () => {
			setupModules({ afk: {} });
			await store.discover();
			const record = store.getRecord('afk');

			// Register the module's own Piece instance so super.unload() (Store#unload) can resolve it.
			const fakeModulePiece: any = { name: 'afk', onUnload: vi.fn().mockResolvedValue(undefined) };
			store.set('afk', fakeModulePiece);

			const insidePiece = { name: 'reminder', location: { full: `${record.dir}/commands/reminder.ts` } };
			const outsidePiece = { name: 'unrelated', location: { full: '/test/modules/other/commands/unrelated.ts' } };
			const commandsStore = {
				name: 'commands',
				paths: new Set([`${record.dir}/commands`]),
				values: vi.fn().mockReturnValue([insidePiece, outsidePiece]),
				unload: vi.fn().mockResolvedValue(undefined)
			};
			container.stores = {
				values: vi.fn().mockReturnValue([commandsStore]),
				get: vi.fn()
			} as any;

			await store.unload('afk');

			// Only the piece located inside the module's directory is unloaded.
			expect(commandsStore.unload).toHaveBeenCalledTimes(1);
			expect(commandsStore.unload).toHaveBeenCalledWith('reminder');
			expect(commandsStore.paths.has(`${record.dir}/commands`)).toBe(false);

			// The module's own piece instance is unloaded via super.unload().
			expect(fakeModulePiece.onUnload).toHaveBeenCalledTimes(1);

			// Directory still exists (fs.access mocked to resolve) -> record kept, marked disabled.
			expect(store.getRecord('afk')).toBeDefined();
			expect(store.getRecord('afk').enabled).toBe(false);
			expect(store.getRecord('afk').state).toBe('disabled');
		});

		it('deletes the record entirely when the module directory no longer exists', async () => {
			setupModules({ afk: {} });
			await store.discover();
			const record = store.getRecord('afk');

			const fakeModulePiece: any = { name: 'afk', onUnload: vi.fn().mockResolvedValue(undefined) };
			store.set('afk', fakeModulePiece);

			container.stores = { values: vi.fn().mockReturnValue([]), get: vi.fn() } as any;

			(fs.access as any).mockImplementation((p: any) => {
				// #exists() does fs.access(p).then().catch(), so this must be a
				// rejected Promise (not a synchronous throw) to be caught correctly.
				if (String(p) === record.dir) return Promise.reject(new Error('ENOENT'));
				return undefined;
			});

			await store.unload('afk');

			expect(store.getRecord('afk')).toBeUndefined();
		});
	});
});
