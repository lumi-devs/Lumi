import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModuleStore } from '../../src/core/module-system/ModuleStore.js';
import { container } from '@sapphire/framework';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('ModuleStore', () => {
	let store: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		// Setup container mocks directly on the real container
		container.prisma = {
			globalModuleState: {
				findMany: vi.fn().mockResolvedValue([])
			}
		} as any;

		container.db = {
			getGlobalModuleStates: vi.fn().mockResolvedValue(new Map()),
			isModuleGlobalEnabled: vi.fn(),
			setModuleGlobalEnabled: vi.fn()
		} as any;

		container.stores = {
			registerPath: vi.fn(),
			values: function () {
				return [this];
			}
		} as any;

		container.logger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn()
		} as any;

		store = new ModuleStore();
		store.load = vi.fn().mockResolvedValue(null);
		
		// Mock _ingest to avoid real dynamic imports in tests
		store._ingest = vi.fn().mockImplementation(async (dir: string, indexPath: string, found: Map<string, any>, globalState: Map<string, boolean>) => {
			const name = path.basename(dir);
			found.set(name, {
				name,
				dir,
				indexUrl: `file://${indexPath}`,
				enabled: globalState.get(name) ?? true,
				meta: { name, dependencies: [], conflicts: [] }
			});
		});
	});

	it('should discover modules in a root directory', async () => {
		store.addRoot(new URL('file:///test/modules'));

		vi.spyOn(fs, 'access').mockResolvedValue(undefined);
		vi.spyOn(fs, 'readdir').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			if (normalized === '/test/modules') {
				return ['afk', 'raids'];
			}
			return [];
		});
		vi.spyOn(fs, 'stat').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			return {
				isDirectory: () => normalized === '/test/modules/afk' || normalized === '/test/modules/raids',
				isFile: () => false
			} as any;
		});

		// Mock _findIndex to return index.ts for each folder
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		await store.discover();

		expect(store._records.has('afk')).toBe(true);
		expect(store._records.has('raids')).toBe(true);
		expect(container.stores.registerPath).toHaveBeenCalledTimes(2);
	});

	it('should handle topological sort for dependencies', async () => {
		store.addRoot(new URL('file:///test/modules'));
		vi.spyOn(fs, 'access').mockResolvedValue(undefined);
		vi.spyOn(fs, 'readdir').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			if (normalized === '/test/modules') {
				return ['a', 'b'];
			}
			return [];
		});
		vi.spyOn(fs, 'stat').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			return {
				isDirectory: () => normalized === '/test/modules/a' || normalized === '/test/modules/b',
				isFile: () => false
			} as any;
		});
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		// Custom _ingest to add dependencies
		store._ingest = vi.fn().mockImplementation(async (dir: string, indexPath: string, found: Map<string, any>, globalState: Map<string, boolean>) => {
			const name = path.basename(dir);
			found.set(name, {
				name,
				dir,
				indexUrl: `file://${indexPath}`,
				enabled: true,
				meta: { name, dependencies: name === 'b' ? ['a'] : [] }
			});
		});

		await store.discover();

		const registerCalls = (container.stores.registerPath as any).mock.calls;
		const order = registerCalls.map((call: any) => {
			try {
				return path.basename(fileURLToPath(call[0]));
			} catch (e) {
				return path.basename(call[0]);
			}
		});

		expect(order).toEqual(['a', 'b']);
	});

	it('should throw on circular dependencies', async () => {
		store.addRoot(new URL('file:///test/modules'));
		vi.spyOn(fs, 'access').mockResolvedValue(undefined);
		vi.spyOn(fs, 'readdir').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			if (normalized === '/test/modules') {
				return ['a', 'b'];
			}
			return [];
		});
		vi.spyOn(fs, 'stat').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			return {
				isDirectory: () => normalized === '/test/modules/a' || normalized === '/test/modules/b',
				isFile: () => false
			} as any;
		});
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		store._ingest = vi.fn().mockImplementation(async (dir: string, indexPath: string, found: Map<string, any>) => {
			const name = path.basename(dir);
			found.set(name, {
				name,
				dir,
				meta: { name, dependencies: [name === 'a' ? 'b' : 'a'] }
			});
		});

		await expect(store.discover()).rejects.toThrow(/Circular dependency/);
	});

	it('should handle conflicts', async () => {
		store.addRoot(new URL('file:///test/modules'));
		vi.spyOn(fs, 'access').mockResolvedValue(undefined);
		vi.spyOn(fs, 'readdir').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			if (normalized === '/test/modules') {
				return ['a', 'b'];
			}
			return [];
		});
		vi.spyOn(fs, 'stat').mockImplementation(async (p: any) => {
			const normalized = path.resolve(p);
			return {
				isDirectory: () => normalized === '/test/modules/a' || normalized === '/test/modules/b',
				isFile: () => false
			} as any;
		});
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		store._ingest = vi.fn().mockImplementation(async (dir: string, indexPath: string, found: Map<string, any>) => {
			const name = path.basename(dir);
			found.set(name, {
				name,
				dir,
				enabled: true,
				meta: { name, conflicts: name === 'a' ? ['b'] : [] }
			});
		});

		await store.discover();

		expect(store._records.get('a').enabled).toBe(true);
		expect(store._records.get('b').enabled).toBe(false);
	});
});
