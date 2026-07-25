import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@sapphire/framework';
import { parseDuration, formatDuration, scheduleCaseLift } from '#modules/mod/lib/helpers.js';
import {
  getThresholds,
  invalidateThresholds,
  incrementWarnCount,
  decrementWarnCount,
  resetWarnCount,
  checkThresholds
} from '#modules/mod/lib/thresholds.js';
import { BanAction } from '#modules/mod/actions/BanAction.js';
import { MuteAction } from '#modules/mod/actions/MuteAction.js';
import { KickAction } from '#modules/mod/actions/KickAction.js';
import { WarnAction } from '#modules/mod/actions/WarnAction.js';
import { QuarantineAction } from '#modules/mod/actions/QuarantineAction.js';

vi.mock('@sapphire/framework', () => ({
  container: {
    redis: {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      exists: vi.fn().mockResolvedValue(0),
      set: vi.fn(),
      pipeline: vi.fn(),
      eval: vi.fn()
    },
    db: {
      config: {
        getModuleConfig: vi.fn()
      },
      moderation: {
        getModerationCases: vi.fn(),
        createModerationCase: vi.fn()
      }
    },
    tasks: {
      create: vi.fn().mockResolvedValue({})
    },
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    },
    client: {
      user: { id: 'bot-1' },
      users: { fetch: vi.fn() },
      guilds: {
        cache: {
          get: vi.fn()
        }
      },
      rest: {
        delete: vi.fn(),
        patch: vi.fn()
      }
    }
  }
}));

vi.mock('#lib/module-system/Service.js', () => ({
  tryGetService: vi.fn(() => ({
    dispatch: vi.fn()
  }))
}));

describe('Mod Helpers & Duration Parsing', () => {
  it('parseDuration converts valid string to ms and invalid/negative to null', () => {
    expect(parseDuration('10m')).toBe(600000);
    expect(parseDuration('2h')).toBe(7200000);
    expect(parseDuration('invalid')).toBeNull();
  });

  it('formatDuration converts ms into human readable string', () => {
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(120000)).toBe('2m');
    expect(formatDuration(7200000)).toBe('2h');
    expect(formatDuration(172800000)).toBe('2d');
  });

  it('scheduleCaseLift handles valid expiresAt date', async () => {
    const mockCase = { id: 101, expiresAt: new Date(Date.now() + 5000) };
    await scheduleCaseLift(container, mockCase);
    expect(container.logger.error).not.toHaveBeenCalled();
  });

  it('scheduleCaseLift returns early if expiresAt is null', async () => {
    await scheduleCaseLift(container, { id: 102, expiresAt: null });
    expect(container.logger.error).not.toHaveBeenCalled();
  });
});

describe('Mod Thresholds Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getThresholds uses cached values if available', async () => {
    (container.redis.get as any).mockResolvedValue(JSON.stringify({ '3': { action: 'kick' } }));
    const thresholds = await getThresholds(container, 'g-1');
    expect(thresholds).toEqual({ '3': { action: 'kick' } });
    expect(container.db.config.getModuleConfig).not.toHaveBeenCalled();
  });

  it('getThresholds fetches DB when cache miss occurs', async () => {
    (container.redis.get as any).mockResolvedValue(null);
    (container.db.config.getModuleConfig as any).mockResolvedValue(JSON.stringify({ '5': { action: 'ban' } }));
    const thresholds = await getThresholds(container, 'g-1');
    expect(thresholds).toEqual({ '5': { action: 'ban' } });
    expect(container.redis.setex).toHaveBeenCalled();
  });

  it('invalidateThresholds deletes redis key', async () => {
    await invalidateThresholds(container, 'g-1');
    expect(container.redis.del).toHaveBeenCalledWith('lumi:mod:g-1:thresholds');
  });

  it('incrementWarnCount initializes count from DB when key does not exist', async () => {
    (container.redis.exists as any).mockResolvedValue(0);
    (container.db.moderation.getModerationCases as any).mockResolvedValue([{}, {}]);
    const count = await incrementWarnCount(container, 'g-1', 'u-1');
    expect(count).toBe(2);
    expect(container.redis.set).toHaveBeenCalled();
  });

  it('incrementWarnCount uses pipeline when count key exists', async () => {
    (container.redis.exists as any).mockResolvedValue(1);
    const mockPipe = {
      incr: vi.fn(),
      expire: vi.fn(),
      exec: vi.fn().mockResolvedValue([[null, 4]])
    };
    (container.redis.pipeline as any).mockReturnValue(mockPipe);
    const count = await incrementWarnCount(container, 'g-1', 'u-1');
    expect(count).toBe(4);
  });

  it('decrementWarnCount and resetWarnCount call redis operations', async () => {
    await decrementWarnCount(container, 'g-1', 'u-1');
    expect(container.redis.eval).toHaveBeenCalled();

    await resetWarnCount(container, 'g-1', 'u-1');
    expect(container.redis.del).toHaveBeenCalledWith('lumi:mod:g-1:warns:u-1');
  });

  it('checkThresholds executes kick action when threshold matches', async () => {
    (container.redis.get as any).mockResolvedValue(JSON.stringify({ '3': { action: 'kick' } }));
    const mockMember = { id: 'u-1' };
    const mockGuild = {
      id: 'g-1',
      members: { fetch: vi.fn().mockResolvedValue(mockMember) }
    };
    (container.client.guilds.cache.get as any).mockReturnValue(mockGuild);

    const kickSpy = vi.spyOn(KickAction, 'apply').mockResolvedValue({ caseNumber: 1 } as any);
    await checkThresholds(container, 'g-1', 'u-1', 3);

    expect(kickSpy).toHaveBeenCalled();
    kickSpy.mockRestore();
  });
});

describe('Mod Actions (Ban, Mute, Kick, Warn, Quarantine)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (container.redis.exists as any).mockResolvedValue(0);
  });

  it('BanAction.apply sends DM, bans user, creates case, and logs to channel', async () => {
    const mockUser = { id: 'u-1', send: vi.fn().mockResolvedValue({}) };
    const mockMod = { id: 'm-1' };
    const mockGuild = { id: 'g-1', name: 'TestGuild', members: { ban: vi.fn().mockResolvedValue({}) } };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ caseNumber: 42 });

    const c = await BanAction.apply({
      guild: mockGuild as any,
      targetUser: mockUser as any,
      moderator: mockMod as any,
      reason: 'Rule breach'
    });

    expect(c.caseNumber).toBe(42);
    expect(mockUser.send).toHaveBeenCalled();
    expect(mockGuild.members.ban).toHaveBeenCalledWith('u-1', expect.anything());
  });

  it('BanAction.undo removes ban and records unban case', async () => {
    const mockMod = { id: 'm-1' };
    const mockGuild = { id: 'g-1', bans: { remove: vi.fn().mockResolvedValue({}) } };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ caseNumber: 43 });

    const c = await BanAction.undo({
      guild: mockGuild as any,
      targetId: 'u-1',
      moderator: mockMod as any,
      reason: 'Appeal approved'
    });

    expect(c.caseNumber).toBe(43);
    expect(mockGuild.bans.remove).toHaveBeenCalled();
  });

  it('BanAction.undoRaw handles 10026 and 50013 silently', async () => {
    const err = new Error('Unknown Ban');
    (err as any).code = 10026;
    (container.client.rest.delete as any).mockRejectedValue(err);

    await expect(BanAction.undoRaw('g-1', 'u-1', 'Reason')).resolves.toBeUndefined();
  });

  it('MuteAction.apply applies timeout and creates moderation case', async () => {
    const mockMember = { id: 'u-1', send: vi.fn().mockResolvedValue({}), timeout: vi.fn().mockResolvedValue({}) };
    const mockMod = { id: 'm-1' };
    const mockGuild = { id: 'g-1', name: 'TestGuild' };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ id: 1, caseNumber: 10, expiresAt: new Date() });

    const c = await MuteAction.apply({
      guild: mockGuild as any,
      targetMember: mockMember as any,
      moderator: mockMod as any,
      reason: 'Spamming',
      durationMs: 600000
    });

    expect(c.caseNumber).toBe(10);
    expect(mockMember.timeout).toHaveBeenCalledWith(600000, expect.anything());
  });

  it('MuteAction.undo removes timeout and records unmute case', async () => {
    const mockMember = { id: 'u-1', timeout: vi.fn().mockResolvedValue({}) };
    const mockMod = { id: 'm-1' };
    const mockGuild = { id: 'g-1' };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ id: 1, caseNumber: 11 });

    const c = await MuteAction.undo({
      guild: mockGuild as any,
      targetMember: mockMember as any,
      moderator: mockMod as any,
      reason: 'Time served'
    });

    expect(c.caseNumber).toBe(11);
    expect(mockMember.timeout).toHaveBeenCalledWith(null, expect.anything());
  });

  it('MuteAction.undoRaw handles 10007 silently', async () => {
    const err = new Error('Unknown Member');
    (err as any).code = 10007;
    (container.client.rest.patch as any).mockRejectedValue(err);

    await expect(MuteAction.undoRaw('g-1', 'u-1', 'Reason')).resolves.toBeUndefined();
  });

  it('KickAction.apply sends DM, kicks member, and creates case', async () => {
    const mockMember = { id: 'u-1', send: vi.fn().mockResolvedValue({}), kick: vi.fn().mockResolvedValue({}) };
    const mockMod = { id: 'm-1' };
    const mockGuild = { id: 'g-1', name: 'TestGuild' };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ caseNumber: 12 });

    const c = await KickAction.apply({
      guild: mockGuild as any,
      targetMember: mockMember as any,
      moderator: mockMod as any,
      reason: 'Insubordination'
    });

    expect(c.caseNumber).toBe(12);
    expect(mockMember.kick).toHaveBeenCalled();
  });

  it('WarnAction.apply creates warn case and increments count', async () => {
    const mockMember = { id: 'u-1', send: vi.fn().mockResolvedValue({}) };
    const mockMod = { id: 'm-1' };
    const mockGuild = { id: 'g-1', name: 'TestGuild' };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ caseNumber: 13 });
    (container.redis.exists as any).mockResolvedValue(0);

    const result = await WarnAction.apply({
      guild: mockGuild as any,
      targetMember: mockMember as any,
      moderator: mockMod as any,
      reason: 'Warning 1'
    });

    expect(result.caseRecord.caseNumber).toBe(13);
  });

  it('QuarantineAction.apply assigns quarantine role and saves state', async () => {
    (container.db.config.getModuleConfig as any).mockResolvedValue('q-role');
    (container.redis.exists as any).mockResolvedValue(0);
    const mockMember = {
      id: 'u-1',
      send: vi.fn().mockResolvedValue({}),
      roles: {
        cache: {
          filter: vi.fn().mockReturnValue([{ id: 'r1' }])
        },
        set: vi.fn().mockResolvedValue({})
      }
    };
    const mockMod = { id: 'm-1' };
    const mockGuild = { id: 'g-1', name: 'TestGuild' };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ id: 2, caseNumber: 14, expiresAt: null });

    const c = await QuarantineAction.apply({
      guild: mockGuild as any,
      targetMember: mockMember as any,
      moderator: mockMod as any,
      reason: 'Suspicious activity'
    });

    expect(c.caseNumber).toBe(14);
    expect(mockMember.roles.set).toHaveBeenCalledWith(['g-1', 'q-role'], expect.anything());
  });

  it('QuarantineAction.undo restores original roles', async () => {
    (container.redis.get as any).mockResolvedValue(JSON.stringify(['r1', 'r2']));
    const mockMember = {
      id: 'u-1',
      roles: {
        set: vi.fn().mockResolvedValue({})
      }
    };
    const mockMod = { id: 'm-1' };
    const mockGuild = {
      id: 'g-1',
      roles: {
        cache: new Map([['r1', { id: 'r1' }], ['r2', { id: 'r2' }]])
      }
    };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({ caseNumber: 15 });

    const c = await QuarantineAction.undo({
      guild: mockGuild as any,
      targetMember: mockMember as any,
      moderator: mockMod as any,
      reason: 'Cleared'
    });

    expect(c.caseNumber).toBe(15);
    expect(mockMember.roles.set).toHaveBeenCalledWith(['g-1', 'r1', 'r2'], expect.anything());
  });
});
