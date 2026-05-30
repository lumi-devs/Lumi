import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { resolvePermissionLevel, PermissionLevel } from '#lib/permissions.js';
import { container } from '@sapphire/framework';

// OWNER_IDS is parsed once at import from envParseString("OWNER_IDS", ""), so the
// mock must return the default string (not undefined) to avoid a load-time crash.
// Bot-owner identity is therefore tested via container.client.application.owner.
vi.mock('#lib/env.js', () => ({
	envParseString: vi.fn((_key: string, def = '') => def),
	envParseInteger: vi.fn(),
	envIsDefined: vi.fn()
}));

describe('resolvePermissionLevel', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		container.db = {
			config: { getGuildSettings: vi.fn().mockResolvedValue({}) }
		} as any;
		container.logger = { error: vi.fn() } as any;
		(container as any).client = undefined;
	});

	it('should return BOT_OWNER if user is an application owner', async () => {
		(container as any).client = { application: { owner: { id: '123' } } };

		const context = {
			userId: '123',
			guild: { id: 'G1', ownerId: '789' },
			member: {
				roles: { cache: { has: () => false } },
				permissions: { has: () => false }
			}
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.BOT_OWNER);
	});

	it('should return GUILD_OWNER if user is guild owner', async () => {
		const context = {
			userId: '123',
			guild: { id: 'G1', ownerId: '123' },
			member: {
				roles: { cache: { has: () => false } },
				permissions: { has: () => false }
			}
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.GUILD_OWNER);
	});

	it('should return ADMIN if user has Administrator permission', async () => {
		const context = {
			userId: '123',
			guild: { id: 'G1', ownerId: '789' },
			member: {
				roles: { cache: { has: () => false } },
				permissions: {
					has: (perm: string) => perm === 'Administrator'
				}
			}
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.ADMIN);
	});

	it('should return ADMIN if user has admin role', async () => {
		(container.db.config.getGuildSettings as Mock).mockResolvedValue({ adminRoleId: 'R_ADMIN' } as any);
		const context = {
			userId: '123',
			guild: { id: 'G1', ownerId: '789' },
			member: {
				roles: { cache: { has: (id: string) => id === 'R_ADMIN' } },
				permissions: { has: () => false }
			}
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.ADMIN);
	});

	it('should return MOD if user has ManageMessages permission', async () => {
		const context = {
			userId: '123',
			guild: { id: 'G1', ownerId: '789' },
			member: {
				roles: { cache: { has: () => false } },
				permissions: {
					has: (perm: string) => perm === 'ManageMessages'
				}
			}
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.MOD);
	});

	it('should return MOD if user has mod role', async () => {
		(container.db.config.getGuildSettings as Mock).mockResolvedValue({ modRoleId: 'R_MOD' } as any);
		const context = {
			userId: '123',
			guild: { id: 'G1', ownerId: '789' },
			member: {
				roles: { cache: { has: (id: string) => id === 'R_MOD' } },
				permissions: { has: () => false }
			}
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.MOD);
	});

	it('should return USER by default', async () => {
		const context = {
			userId: '123',
			guild: { id: 'G1', ownerId: '789' },
			member: {
				roles: { cache: { has: () => false } },
				permissions: { has: () => false }
			}
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.USER);
	});

	it('should fallback to USER if guild or member is missing', async () => {
		const context = {
			userId: '123'
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.USER);
	});
});
