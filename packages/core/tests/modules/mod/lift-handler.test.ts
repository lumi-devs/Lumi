import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@sapphire/framework';
import { handleModLiftFire } from '#modules/mod/lib/lift-handler.js';

vi.mock('@sapphire/framework', () => ({
  container: {
    invalidation: undefined,
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
    client: {
      rest: {
        patch: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      }
    }
  }
}));

vi.mock('#lib/module-system/Service.js', () => ({
  tryGetService: vi.fn(() => ({
    dispatch: vi.fn()
  }))
}));

describe('handleModLiftFire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    await handleModLiftFire({ caseId: 3 });

    expect(container.client.rest.patch).toHaveBeenCalledWith(
      expect.stringContaining('/guilds/g1/members/u1'),
      expect.objectContaining({ body: { mute: false } })
    );
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

    await handleModLiftFire({ caseId: 4 });

    expect(container.client.rest.patch).toHaveBeenCalled();
    expect(container.db.moderation.liftModerationCase).toHaveBeenCalledWith(4);
  });
});
