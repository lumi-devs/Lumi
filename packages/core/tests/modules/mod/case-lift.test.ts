import { describe, it, expect, vi, beforeEach } from 'bun:test';
import { container } from '@sapphire/framework';
import { liftModerationCaseWithUndo } from '#modules/mod/services/case-lift.js';
import { FakeDiscordRestPort } from '#lib/discord/fake-rest-port.js';
import type { ModerationCase } from '@prisma/client';

const discordRest = new FakeDiscordRestPort();

vi.mock('@sapphire/framework', () => ({
  container: {
    invalidation: {
      invalidate: vi.fn().mockResolvedValue(undefined)
    },
    db: {
      moderation: {
        liftModerationCase: vi.fn().mockResolvedValue(undefined)
      }
    },
    discordRest
  }
}));

function makeCase(overrides: Partial<ModerationCase> = {}): ModerationCase {
  return {
    id: 1,
    guildId: 'g-1',
    userId: 'u-1',
    moderatorId: 'm-1',
    action: 'mute',
    reason: 'test',
    duration: null,
    expiresAt: null,
    active: true,
    caseNumber: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('liftModerationCaseWithUndo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('clears a timeout for a mute case, then marks it lifted', async () => {
    const clearTimeout = vi.spyOn(discordRest, 'clearTimeout');

    await liftModerationCaseWithUndo(makeCase({ action: 'mute' }), 'Reason');

    expect(clearTimeout).toHaveBeenCalledWith('g-1', 'u-1', 'Reason');
    expect(container.db.moderation.liftModerationCase).toHaveBeenCalledWith(1);
  });

  it('removes the ban for a ban case, then marks it lifted', async () => {
    const removeBan = vi.spyOn(discordRest, 'removeBan');

    await liftModerationCaseWithUndo(makeCase({ action: 'ban' }), 'Reason');

    expect(removeBan).toHaveBeenCalledWith('g-1', 'u-1', 'Reason');
    expect(container.db.moderation.liftModerationCase).toHaveBeenCalledWith(1);
  });

  it('clears the voice mute for a voice_mute case, then marks it lifted', async () => {
    const clearVoiceMute = vi.spyOn(discordRest, 'clearVoiceMute');

    await liftModerationCaseWithUndo(makeCase({ action: 'voice_mute' }), 'Reason');

    expect(clearVoiceMute).toHaveBeenCalledWith('g-1', 'u-1', 'Reason');
    expect(container.db.moderation.liftModerationCase).toHaveBeenCalledWith(1);
  });

  it('does not mark the case lifted when Discord denies the undo', async () => {
    const err = Object.assign(new Error('Missing Permissions'), { code: 50013 });
    discordRest.failNextWith('clearTimeout', err);

    await expect(
      liftModerationCaseWithUndo(makeCase({ action: 'mute' }), 'Reason'),
    ).rejects.toThrow('Missing Permissions');

    expect(container.db.moderation.liftModerationCase).not.toHaveBeenCalled();
  });

  it('skips the Discord-side undo for an action with no REST effect (warn)', async () => {
    const clearTimeout = vi.spyOn(discordRest, 'clearTimeout');
    const removeBan = vi.spyOn(discordRest, 'removeBan');
    const clearVoiceMute = vi.spyOn(discordRest, 'clearVoiceMute');

    await liftModerationCaseWithUndo(makeCase({ action: 'warn', id: 2, caseNumber: 2 }), 'Reason');

    expect(clearTimeout).not.toHaveBeenCalled();
    expect(removeBan).not.toHaveBeenCalled();
    expect(clearVoiceMute).not.toHaveBeenCalled();
    expect(container.db.moderation.liftModerationCase).toHaveBeenCalledWith(2);
  });
});
