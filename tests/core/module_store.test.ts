import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ModuleStore } from '../../src/core/module-system/ModuleStore.js';
import { container } from '@sapphire/framework';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal() as any;
	return {
		...actual,
		promises: {
			...actual.promises,
			readdir: vi.fn(),
			stat: vi.fn(),
			access: vi.fn()
		}
	};
});

vi.mock('@sapphire/framework', async (importOriginal) => {
	const actual = await importOriginal() as any;
	return {
		...actual,
		container: {                        ...actual.container,
                        prisma: {
                                globalModuleState: {
                                        findMany: vi.fn().mockResolvedValue([])
                                }
                        },
                        db: {
                                getGlobalModuleStates: vi.fn().mockResolvedValue(new Map())
                        },
                        stores: {
                                registerPath: vi.fn(),
                                values: function () {
                                        return [this];
                                }
                        },
                        logger: {
                                info: vi.fn(),
                                warn: vi.fn(),
                                error: vi.fn(),
                                debug: vi.fn()
                        }
                }
        };
});

describe('ModuleStore', () => {
        let store: any;

        beforeEach(() => {
                vi.resetAllMocks();
                (container.db.getGlobalModuleStates as Mock).mockResolvedValue(new Map());		store = new ModuleStore();
		store.load = vi.fn().mockResolvedValue(null);
		// Mock _ingest to avoid real dynamic imports in tests
		store._ingest = vi.fn().mockImplementation(async (dir, indexPath, found, globalState) => {
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

		(fs.access as Mock).mockResolvedValue(undefined);
		(fs.readdir as Mock).mockResolvedValue(['afk', 'raids']);
		(fs.stat as Mock).mockImplementation(async (p) => ({
			isDirectory: () => !p.endsWith('.ts'),
			isFile: () => p.endsWith('.ts')
		}));

		// Mock _findIndex to return index.ts for each folder
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		await store.discover();

		expect(store._records.has('afk')).toBe(true);
		expect(store._records.has('raids')).toBe(true);
		expect(container.stores.registerPath).toHaveBeenCalledTimes(2);
	});

	it('should handle topological sort for dependencies', async () => {
		store.addRoot(new URL('file:///test/modules'));
		(fs.access as Mock).mockResolvedValue(undefined);
		(fs.readdir as Mock).mockResolvedValue(['a', 'b']);
		(fs.stat as Mock).mockImplementation(async () => ({ isDirectory: () => true }));
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		// Custom _ingest to add dependencies
		store._ingest = vi.fn().mockImplementation(async (dir, indexPath, found, globalState) => {
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

		const registerCalls = (container.stores.registerPath as Mock).mock.calls;
		const order = registerCalls.map(call => {
			try {
				return path.basename(fileURLToPath(call[0]));
			} catch (e) {
				return path.basename(call[0]);
			}
		});

		expect(order).toEqual(['a', 'b']);	});

	it('should throw on circular dependencies', async () => {
		store.addRoot(new URL('file:///test/modules'));
		(fs.access as Mock).mockResolvedValue(undefined);
		(fs.readdir as Mock).mockResolvedValue(['a', 'b']);
		(fs.stat as Mock).mockImplementation(async () => ({ isDirectory: () => true }));
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		store._ingest = vi.fn().mockImplementation(async (dir, indexPath, found) => {
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
		(fs.access as Mock).mockResolvedValue(undefined);
		(fs.readdir as Mock).mockResolvedValue(['a', 'b']);
		(fs.stat as Mock).mockImplementation(async () => ({ isDirectory: () => true }));
		store._findIndex = vi.fn().mockImplementation(async (dir) => path.join(dir, 'index.ts'));

		store._ingest = vi.fn().mockImplementation(async (dir, indexPath, found) => {
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
