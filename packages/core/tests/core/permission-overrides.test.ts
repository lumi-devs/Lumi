import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { PermissionOverridesPrecondition } from '#lib/permissions/preconditions/PermissionOverrides.js';
import { container } from '@sapphire/framework';

import { PermissionLevel } from '#lib/permissions/index.js';

describe('PermissionOverridesPrecondition', () => {
        let precondition: any;

        beforeEach(() => {
                vi.resetAllMocks();
                process.env.OWNER_IDS = 'BOT_OWNER_ID';

                // Manually populate container with mocks.
                (container as any).logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
                (container as any).redis = { get: vi.fn(), set: vi.fn() };
                (container as any).db = {
                        permissions: { getPermissionOverrides: vi.fn().mockResolvedValue([]) },
                        config: { getGuildSettings: vi.fn().mockResolvedValue({}) }
                };

                precondition = new PermissionOverridesPrecondition({ name: 'PermissionOverrides', store: { name: 'preconditions' } as any }, { position: 22 } as any);
        });
	it('should return ok for bot owner', async () => {
		const interaction = {
			guild: { id: 'G1' },
			user: { id: 'BOT_OWNER_ID' },
			commandName: 'test',
			options: { getSubcommandGroup: () => null, getSubcommand: () => null }
		};
		
		const result = await precondition.chatInputRun(interaction as any);
		expect(result.isOk()).toBe(true);
	});

	it('should return ok for guild owner', async () => {
		const interaction = { guild: { id: 'G1', ownerId: 'U1' }, user: { id: 'U1' } };
		
		const result = await precondition.chatInputRun(interaction as any);
		expect(result.isOk()).toBe(true);
	});

	it('should handle user-specific override (deny)', async () => {
		const interaction = {
			guild: {
				id: 'G1',
				ownerId: 'OWNER',
				channels: { cache: new Map() },
				roles: { cache: new Map() }
			},
			user: { id: 'U1' },
			channelId: 'C1',
			commandName: 'test',
			options: { getSubcommandGroup: () => null, getSubcommand: () => null },
			member: { roles: { cache: new Map() } }
		};

		(container.redis.get as Mock).mockResolvedValue(null);
		(container.db.permissions.getPermissionOverrides as Mock).mockResolvedValue([
		        { modelType: 'user', modelId: 'U1', allow: false }
		]);
		const result = await precondition.chatInputRun(interaction as any);
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const error = (result as any).unwrapErr();
			const message = error.message ?? error.context?.message;
			expect(message).toBe('You are not permitted to use this command.');
		}
	});

	it('should handle role override (allow wins over everyone deny)', async () => {
		const interaction = {
			guild: {
				id: 'G1',
				ownerId: 'OWNER',
				channels: { cache: new Map() },
				roles: { cache: new Map([['R1', { position: 10 }]]) }
			},
			user: { id: 'U1' },
			channelId: 'C1',
			commandName: 'test',
			options: { getSubcommandGroup: () => null, getSubcommand: () => null },
			member: { roles: { cache: new Map([['R1', {}]]) } }
		};

		(container.redis.get as Mock).mockResolvedValue(null);
		(container.db.permissions.getPermissionOverrides as Mock).mockResolvedValue([
		        { modelType: 'everyone', modelId: 'G1', allow: false },
		        { modelType: 'role', modelId: 'R1', allow: true }
		]);
		const result = await precondition.chatInputRun(interaction as any);
		expect(result.isOk()).toBe(true);
	});

	it('should handle highest role priority (deny wins over allow)', async () => {
		const interaction = {
			guild: {
				id: 'G1',
				ownerId: 'OWNER',
				channels: { cache: new Map() },
				roles: {
					cache: new Map([
						['R_LOW', { position: 1 }],
						['R_HIGH', { position: 10 }]
					])
				}
			},
			user: { id: 'U1' },
			channelId: 'C1',
			commandName: 'test',
			options: { getSubcommandGroup: () => null, getSubcommand: () => null },
			member: { roles: { cache: new Map([['R_LOW', {}], ['R_HIGH', {}]]) } }
		};

		(container.redis.get as Mock).mockResolvedValue(null);
		(container.db.permissions.getPermissionOverrides as Mock).mockResolvedValue([
		        { modelType: 'role', modelId: 'R_LOW', allow: true },
		        { modelType: 'role', modelId: 'R_HIGH', allow: false }
		]);
		const result = await precondition.chatInputRun(interaction as any);
		expect(result.isErr()).toBe(true);
	});

	it('should handle category override', async () => {
		const interaction = {
			guild: {
				id: 'G1',
				ownerId: 'OWNER',
				channels: { cache: new Map([['C1', { parentId: 'CAT1' }]]) },
				roles: { cache: new Map() }
			},
			user: { id: 'U1' },
			channelId: 'C1',
			commandName: 'test',
			options: { getSubcommandGroup: () => null, getSubcommand: () => null },
			member: { roles: { cache: new Map() } }
		};

		(container.redis.get as Mock).mockResolvedValue(null);
		(container.db.permissions.getPermissionOverrides as Mock).mockResolvedValue([
		        { modelType: 'category', modelId: 'CAT1', allow: false }
		]);
		const result = await precondition.chatInputRun(interaction as any);
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const error = (result as any).unwrapErr();
			const message = error.message ?? error.context?.message;
			expect(message).toBe('This command is not permitted in this category.');
		}
	});
});
