import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@sapphire/framework';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Discovery is manifest-driven: #walk → readManifest → #ingestManifest, with no
// module code imported. Mock the manifest layer and drive the FS walk so we test
// the real walk/topo/conflict pipeline through the public API.
const { readManifest, metaFromManifest } = vi.hoisted(() => ({
	readManifest: vi.fn(),
	metaFromManifest: vi.fn()
}));

vi.mock('../../src/core/module-system/manifest.js', () => ({ readManifest, metaFromManifest }));

import { ModuleStore } from '../../src/core/module-system/ModuleStore.js';

type ModSpec = { dependencies?: string[]; conflicts?: string[]; isCore?: boolean };

/**
 * Wire the mocked FS + manifest layer so `discover()` finds one module dir per
 * key under /test/modules. `order` sets the readdir order (to exercise topo sort).
 */
function setupModules(mods: Record<string, ModSpec>, order: string[] = Object.keys(mods)) {
	const names = Object.keys(mods);
	vi.spyOn(fs, 'access').mockResolvedValue(undefined);
	vi.spyOn(fs, 'readdir').mockImplementation(
		async (p: any) => (names.includes(path.basename(String(p))) ? [] : order) as any
	);
	vi.spyOn(fs, 'stat').mockImplementation(
		async (p: any) =>
			({
				isDirectory: () => names.includes(path.basename(String(p))),
				isFile: () => false
			}) as any
	);
	readManifest.mockImplementation(async (dir: string) => {
		const name = path.basename(dir);
		return names.includes(name) ? { name, ...mods[name] } : null;
	});
}

describe('ModuleStore', () => {
	let store: any;

	beforeEach(() => {
		vi.restoreAllMocks();
		metaFromManifest.mockImplementation((m: any) => ({
			name: m.name,
			displayName: m.name,
			dependencies: m.dependencies ?? [],
			conflicts: m.conflicts ?? [],
			isCore: m.isCore ?? false
		}));

		// DatabaseService is namespaced — ModuleStore reads via container.db.modules.*
		container.db = {
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

	it('should throw on circular dependencies', async () => {
		setupModules({ a: { dependencies: ['b'] }, b: { dependencies: ['a'] } });
		await expect(store.discover()).rejects.toThrow(/Circular dependency/);
	});

	it('should handle conflicts', async () => {
		setupModules({ a: { conflicts: ['b'] }, b: {} });
		await store.discover();

		expect(store.getRecord('a').enabled).toBe(true);
		expect(store.getRecord('b').enabled).toBe(false);
	});
});
