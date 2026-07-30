import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermitResolver, evaluateNodeMatch } from '#lib/permissions/PermitResolver.js';
import { container } from '@sapphire/framework';

vi.mock('#lib/env.js', () => ({
  envParseString: vi.fn((_key: string, def = '') => def),
  envParseInteger: vi.fn(),
  envIsDefined: vi.fn()
}));

describe('PermitResolver', () => {
  let resolver: PermitResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new PermitResolver();
  });

  describe('isBotOwner', () => {
    it('should return false when no owner IDs configured', () => {
      expect(PermitResolver.isBotOwner('123')).toBe(false);
    });
  });

  describe('isGuildOwner', () => {
    it('should return true when userId matches guildOwnerId', () => {
      expect(PermitResolver.isGuildOwner('123', '123')).toBe(true);
    });

    it('should return false when userId does not match guildOwnerId', () => {
      expect(PermitResolver.isGuildOwner('123', '456')).toBe(false);
    });

    it('should return false when guildOwnerId is null', () => {
      expect(PermitResolver.isGuildOwner(null, '123')).toBe(false);
    });
  });

  describe('evaluateNodeMatch', () => {
    it('should match exact node names', () => {
      expect(evaluateNodeMatch('mod.ban', 'mod.ban')).toBe(true);
      expect(evaluateNodeMatch('mod.ban', 'mod.kick')).toBe(false);
    });

    it('should match global wildcard *', () => {
      expect(evaluateNodeMatch('*', 'mod.ban')).toBe(true);
    });

    it('should match section wildcards', () => {
      expect(evaluateNodeMatch('mod.*', 'mod.ban')).toBe(true);
      expect(evaluateNodeMatch('mod.*', 'config.prefix')).toBe(false);
    });
  });

  describe('hasPermit', () => {
    it('should grant access to guild owner regardless of permits', async () => {
      const allowed = await resolver.hasPermit({
        guildId: 'G1',
        userId: 'OWNER',
        permitNode: 'mod.ban',
        guildOwnerId: 'OWNER',
      });
      expect(allowed).toBe(true);
    });

    it('should check custom permits when not quarantined', async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(['mod.warn']),
          enforcedPermits: new Set(),
          isQuarantined: false,
        }),
      };

      expect(await resolver.hasPermit({ guildId: 'G1', userId: 'U1', permitNode: 'mod.warn' })).toBe(true);
      expect(await resolver.hasPermit({ guildId: 'G1', userId: 'U1', permitNode: 'mod.ban' })).toBe(false);
    });

    it('should strip custom permits when quarantined', async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(['mod.warn']),
          enforcedPermits: new Set(),
          isQuarantined: true,
        }),
      };

      expect(await resolver.hasPermit({ guildId: 'G1', userId: 'U1', permitNode: 'mod.warn' })).toBe(false);
    });

    it('should preserve enforced permits when quarantined', async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(['mod.warn']),
          enforcedPermits: new Set(['system.emergency']),
          isQuarantined: true,
        }),
      };

      expect(await resolver.hasPermit({ guildId: 'G1', userId: 'U1', permitNode: 'system.emergency' })).toBe(true);
      expect(await resolver.hasPermit({ guildId: 'G1', userId: 'U1', permitNode: 'mod.warn' })).toBe(false);
    });
  });
});
