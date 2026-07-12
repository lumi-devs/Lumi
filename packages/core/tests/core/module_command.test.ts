import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@sapphire/framework';
import { ModuleCommand } from '#modules/core/commands/module.js';

describe('ModuleCommand', () => {
	let command: ModuleCommand;
	let mockModuleStore: any;
	let mockDownloaderService: any;
	let mockStores: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		// Setup mock ModuleStore records
		mockModuleStore = {
			all: vi.fn().mockReturnValue([
				{
					name: 'afk',
					enabled: true,
					state: 'loaded',
					meta: {
						name: 'afk',
						displayName: 'AFK',
						emoji: '💤',
						version: '1.0.0',
						description: 'AFK desc',
						isCore: false,
						dependencies: [],
						conflicts: []
					}
				},
				{
					name: 'mod',
					enabled: false,
					state: 'disabled',
					meta: {
						name: 'mod',
						displayName: 'Moderation',
						emoji: '🛡️',
						version: '1.2.0',
						description: 'Mod desc',
						isCore: true,
						dependencies: [],
						conflicts: []
					}
				}
			]),
			getRecord: vi.fn().mockImplementation((name: string) => {
				if (name === 'afk') {
					return {
						name: 'afk',
						enabled: true,
						state: 'loaded',
						meta: {
							name: 'afk',
							displayName: 'AFK',
							emoji: '💤',
							version: '1.0.0',
							description: 'AFK desc',
							isCore: false,
							dependencies: [],
							conflicts: []
						}
					};
				}
				if (name === 'mod') {
					return {
						name: 'mod',
						enabled: false,
						state: 'disabled',
						meta: {
							name: 'mod',
							displayName: 'Moderation',
							emoji: '🛡️',
							version: '1.2.0',
							description: 'Mod desc',
							isCore: true,
							dependencies: [],
							conflicts: []
						}
					};
				}
				return null;
			}),
			setEnabled: vi.fn().mockResolvedValue(undefined),
			moduleNameForLocation: vi.fn().mockImplementation((path: string) => {
				if (path.includes('afk')) return 'afk';
				if (path.includes('mod')) return 'mod';
				return null;
			})
		};

		mockDownloaderService = {
			installModule: vi.fn(),
			uninstallModule: vi.fn(),
			updateModule: vi.fn(),
			syncApplicationCommands: vi.fn(),
			getInstalledModules: vi.fn().mockResolvedValue([]),
		};

		// Mock pieces stores (e.g. commands and listeners)
		const mockCommandsStore = {
			name: 'commands',
			values: vi.fn().mockReturnValue([
				{ name: 'afk_cmd', location: { full: '/path/to/modules/afk/commands/afk.ts' } },
				{ name: 'ban', location: { full: '/path/to/modules/mod/commands/ban.ts' } }
			])
		};

		const mockListenersStore = {
			name: 'listeners',
			values: vi.fn().mockReturnValue([
				{ name: 'afk_listener', location: { full: '/path/to/modules/afk/listeners/afk.ts' } }
			])
		};

		mockStores = {
			get: vi.fn().mockImplementation((storeName: string) => {
				if (storeName === 'services') {
					return {
						get: vi.fn().mockImplementation((svcName: string) => {
							if (svcName === 'downloader') return mockDownloaderService;
							return null;
						})
					};
				}
				if (storeName === 'commands') return mockCommandsStore;
				if (storeName === 'listeners') return mockListenersStore;
				return null;
			}),
			values: vi.fn().mockReturnValue([mockCommandsStore, mockListenersStore])
		};

		container.moduleStore = mockModuleStore as any;
		container.stores = mockStores as any;
		container.logger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn()
		} as any;
		(container as any).client = {
			options: {}
		} as any;

		command = new ModuleCommand(
			{
				name: 'module',
				path: '/path/to/commands/module.ts',
				root: '/path/to/commands',
				store: { name: 'commands' } as any
			} as any,
			{ prefixEnabled: true }
		);
	});

	const getCardTitle = (reply: any): string => {
		const json = reply.components[0].toJSON();
		return json.components[0].content;
	};

	const getCardBody = (reply: any): string => {
		const json = reply.components[0].toJSON();
		return json.components[2]?.content || '';
	};

	describe('list', () => {
		it('should list all discovered modules with status and versions', async () => {
			const mockMessage = {
				author: { id: '0' },
				reply: vi.fn().mockResolvedValue({
					createMessageComponentCollector: vi.fn().mockReturnValue({
						on: vi.fn()
					})
				})
			} as any;

			await (command as any).__ctxMsg$list(mockMessage);
			expect(mockMessage.reply).toHaveBeenCalled();

			const replyArg = mockMessage.reply.mock.calls[0][0];
			const body = getCardBody(replyArg);
			expect(body).toContain('AFK');
			expect(body).toContain('Moderation');
			expect(body).toContain('v1.0.0');
			expect(body).toContain('v1.2.0');
		});
	});

	describe('info', () => {
		it('should show detailed information and counts of registered pieces', async () => {
			const mockMessage = {
				reply: vi.fn()
			} as any;

			const mockArgs = {
				pick: vi.fn().mockResolvedValue('afk')
			} as any;

			await (command as any).__ctxMsg$info(mockMessage, mockArgs);
			expect(mockMessage.reply).toHaveBeenCalled();

			const replyArg = mockMessage.reply.mock.calls[0][0];
			const body = getCardBody(replyArg);
			expect(body).toContain('AFK');
			expect(body).toContain('AFK desc');
			expect(body).toContain('2 total');
			expect(body).toContain('afk_cmd');
			expect(body).toContain('afk_listener');
		});

		it('should reply with error card if module is not found', async () => {
			const mockMessage = {
				reply: vi.fn()
			} as any;

			const mockArgs = {
				pick: vi.fn().mockResolvedValue('unknown_module')
			} as any;

			await (command as any).__ctxMsg$info(mockMessage, mockArgs);
			expect(mockMessage.reply).toHaveBeenCalled();

			const replyArg = mockMessage.reply.mock.calls[0][0];
			expect(getCardTitle(replyArg)).toContain('Not Found');
		});
	});

	describe('enable / disable', () => {
		it('should enable a module globally', async () => {
			const mockMessage = {
				reply: vi.fn()
			} as any;

			const mockArgs = {
				pick: vi.fn().mockResolvedValue('afk')
			} as any;

			await (command as any).__ctxMsg$enable(mockMessage, mockArgs);
			expect(mockModuleStore.setEnabled).toHaveBeenCalledWith('afk', true);
			expect(mockMessage.reply).toHaveBeenCalled();

			const replyArg = mockMessage.reply.mock.calls[0][0];
			expect(getCardTitle(replyArg)).toContain('Enabled Module');
		});

		it('should not allow disabling core modules', async () => {
			const mockMessage = {
				reply: vi.fn()
			} as any;

			const mockArgs = {
				pick: vi.fn().mockResolvedValue('mod')
			} as any;

			await (command as any).__ctxMsg$disable(mockMessage, mockArgs);
			expect(mockModuleStore.setEnabled).not.toHaveBeenCalled();
			expect(mockMessage.reply).toHaveBeenCalled();

			const replyArg = mockMessage.reply.mock.calls[0][0];
			expect(getCardTitle(replyArg)).toContain('Forbidden');
		});
	});
});
