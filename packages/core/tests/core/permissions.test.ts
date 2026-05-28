import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { resolvePermissionLevel, PermissionLevel } from '#lib/permissions.js';
import { envParseString } from '#lib/env.js';
import { container } from '@sapphire/framework';

vi.mock('#lib/env.js', () => ({
	envParseString: vi.fn(),
	envParseInteger: vi.fn(),
	envIsDefined: vi.fn()
}));

describe('resolvePermissionLevel', () => {
	beforeEach(() => {
	        vi.resetAllMocks();
	        container.db = {
	                getGuildSettings: vi.fn().mockResolvedValue({})
	        } as any;
	});
	it('should return BOT_OWNER if user ID is in OWNER_IDS', async () => {
		(envParseString as Mock).mockReturnValue('123, 456');

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
		(envParseString as Mock).mockReturnValue('999');

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
		(envParseString as Mock).mockReturnValue('999');

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
		(envParseString as Mock).mockReturnValue('999');
		(container.db.getGuildSettings as Mock).mockResolvedValue({ adminRoleId: 'R_ADMIN' } as any);
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
		(envParseString as Mock).mockReturnValue('999');

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
		(envParseString as Mock).mockReturnValue('999');
		(container.db.getGuildSettings as Mock).mockResolvedValue({ modRoleId: 'R_MOD' } as any);
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
		(envParseString as Mock).mockReturnValue('999');

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
		(envParseString as Mock).mockReturnValue('999');

		const context = {
			userId: '123'
		};

		const level = await resolvePermissionLevel(context as any);
		expect(level).toBe(PermissionLevel.USER);
	});
});
