import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionOverridesPrecondition } from '#lib/permissions/preconditions/PermissionOverrides.js';
import { container } from '@sapphire/framework';
import { PermitResolver } from '#lib/permissions/PermitResolver.js';

describe('PermissionOverridesPrecondition', () => {
  let precondition: any;

  beforeEach(() => {
    vi.resetAllMocks();
    (container as any).permitResolver = new PermitResolver();
    (container as any).db = {
      getUserPermits: vi.fn().mockResolvedValue({
        customPermits: new Set(),
        enforcedPermits: new Set(),
        isQuarantined: false,
      }),
      permissions: {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(),
          enforcedPermits: new Set(),
          isQuarantined: false,
        }),
      },
    };

    precondition = new PermissionOverridesPrecondition(
      { name: 'PermissionOverrides', store: { name: 'preconditions' } as any },
      { position: 22 } as any,
    );
  });

  it('should return ok for bot owner', async () => {
    vi.spyOn(PermitResolver, 'isBotOwner').mockReturnValue(true);
    const interaction = { guild: { id: 'G1', ownerId: 'O1' }, user: { id: 'U1' } };
    const result = await precondition.chatInputRun(interaction as any);
    expect(result.isOk()).toBe(true);
  });

  it('should return ok for guild owner', async () => {
    vi.spyOn(PermitResolver, 'isBotOwner').mockReturnValue(false);
    const interaction = { guild: { id: 'G1', ownerId: 'U1' }, user: { id: 'U1' } };
    const result = await precondition.chatInputRun(interaction as any);
    expect(result.isOk()).toBe(true);
  });

  it('should return ok when permit check passes', async () => {
    vi.spyOn(PermitResolver, 'isBotOwner').mockReturnValue(false);
    (container as any).db.getUserPermits = vi.fn().mockResolvedValue({
      customPermits: new Set(['ban']),
      enforcedPermits: new Set(),
      isQuarantined: false,
    });

    const interaction = {
      guild: { id: 'G1', ownerId: 'O1' },
      user: { id: 'U1' },
      member: { roles: { cache: new Map() } },
      commandName: 'ban',
      options: { getSubcommandGroup: vi.fn(), getSubcommand: vi.fn() },
    };

    const result = await precondition.chatInputRun(interaction as any);
    expect(result.isOk()).toBe(true);
  });

  it('should return error when permit check fails', async () => {
    vi.spyOn(PermitResolver, 'isBotOwner').mockReturnValue(false);
    (container as any).db.getUserPermits = vi.fn().mockResolvedValue({
      customPermits: new Set(),
      enforcedPermits: new Set(),
      isQuarantined: false,
    });

    const interaction = {
      guild: { id: 'G1', ownerId: 'O1' },
      user: { id: 'U1' },
      member: { roles: { cache: new Map() } },
      commandName: 'ban',
      options: { getSubcommandGroup: vi.fn(), getSubcommand: vi.fn() },
    };

    const result = await precondition.chatInputRun(interaction as any);
    expect(result.isErr()).toBe(true);
  });
});
