import { describe, it, expect, vi, beforeEach } from 'bun:test';
import { container } from '@sapphire/framework';
import { handleModLiftFire } from '#modules/mod/services/lift-handler.js';
import { FakeDiscordRestPort } from '#lib/discord/fake-rest-port.js';

const discordRest = new FakeDiscordRestPort();

Object.assign(container, {
  invalidation: {
    invalidate: vi.fn().mockResolvedValue(undefined)
  },
  redis: {
    del: vi.fn(),
    set: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(1)
  },
  db: {
    moderation: {
      getModerationCaseById: vi.fn(),
      liftModerationCase: vi.fn()
    }
  },
  tasks: {
    create: vi.fn().mockResolvedValue({})
  },
  logger: {
    error: vi.fn(),
    debug: vi.fn()
  },
  discordRest
});

describe('handleModLiftFire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('does nothing when the case is missing or already inactive', async () => {
    (container.db.moderation.getModerationCaseById as any).mockResolvedValue(null);
    await handleModLiftFire({ caseId: 1 });
    expect(container.db.moderation.liftModerationCase).not.toHaveBeenCalled();

    (container.db.moderation.getModerationCaseById as any).mockResolvedValue({ id: 2, active: false });
    await handleModLiftFire({ caseId: 2 });
    expect(container.db.moderation.liftModerationCase).not.toHaveBeenCalled();
  });

  it('clears the Discord-side mute for a voice_mute case before lifting it', async () => {
    (container.db.moderation.getModerationCaseById as any).mockResolvedValue({
      id: 3,
      caseNumber: 3,
      guildId: 'g1',
      userId: 'u1',
      action: 'voice_mute',
      active: true
    });
    const clearVoiceMute = vi.spyOn(discordRest, 'clearVoiceMute');

    await handleModLiftFire({ caseId: 3 });

    expect(clearVoiceMute).toHaveBeenCalledWith('g1', 'u1', expect.any(String));
    expect(container.db.moderation.liftModerationCase).toHaveBeenCalledWith(3);
  });

  it('still handles mute and ban cases as before', async () => {
    (container.db.moderation.getModerationCaseById as any).mockResolvedValue({
      id: 4,
      caseNumber: 4,
      guildId: 'g1',
      userId: 'u1',
      action: 'mute',
      active: true
    });
    const clearTimeout = vi.spyOn(discordRest, 'clearTimeout');

    await handleModLiftFire({ caseId: 4 });

    expect(clearTimeout).toHaveBeenCalledWith('g1', 'u1', expect.any(String));
    expect(container.db.moderation.liftModerationCase).toHaveBeenCalledWith(4);
  });

  it('leaves the case active, logs, and rethrows when Discord denies the undo with 50013', async () => {
    (container.db.moderation.getModerationCaseById as any).mockResolvedValue({
      id: 5,
      caseNumber: 5,
      guildId: 'g1',
      userId: 'u1',
      action: 'mute',
      active: true
    });
    const err = Object.assign(new Error('Missing Permissions'), { code: 50013 });
    discordRest.failNextWith('clearTimeout', err);

    await expect(handleModLiftFire({ caseId: 5 })).rejects.toThrow('Missing Permissions');

    expect(container.db.moderation.liftModerationCase).not.toHaveBeenCalled();
    expect(container.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('lacks Discord permission'),
      err,
    );
  });
});
