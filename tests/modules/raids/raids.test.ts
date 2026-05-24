import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordRaidJoin,
  isGuildRaidLocked,
  lockGuildForRaid,
  unlockGuildFromRaid,
  scheduleRaidUnlock
} from '#modules/raids/data.js';
import { container } from '@sapphire/framework';
import { enqueueJob } from '#lib/rabbit.js';
import { GuildVerificationLevel } from 'discord.js';

vi.mock('@sapphire/framework', () => ({
  container: {
    redis: {
      pipeline: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      exec: vi.fn(),
      exists: vi.fn(),
      set: vi.fn(),
      del: vi.fn()
    },
    prisma: {
      raidLockdown: {
        upsert: vi.fn(),
        deleteMany: vi.fn()
      }
    },
    logger: {
      warn: vi.fn()
    },
    rabbit: {}
  }
}));

vi.mock('#lib/rabbit.js', () => ({
  enqueueJob: vi.fn()
}));

describe('Raids Data Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordRaidJoin returns zcount of joins in window', async () => {
    (container.redis.exec as any).mockResolvedValue([[null, 1], [null, 1], [null, 1], [null, 5]]);
    const count = await recordRaidJoin('g1', 10);
    expect(count).toBe(5);
    expect(container.redis.pipeline).toHaveBeenCalled();
  });

  it('isGuildRaidLocked returns true when redis key exists', async () => {
    (container.redis.exists as any).mockResolvedValue(1);
    expect(await isGuildRaidLocked('g1')).toBe(true);
  });

  it('lockGuildForRaid saves lockdown to DB and redis', async () => {
    await lockGuildForRaid('g1', GuildVerificationLevel.Medium, 60);
    expect(container.prisma.raidLockdown.upsert).toHaveBeenCalled();
    expect(container.redis.set).toHaveBeenCalled();
  });

  it('unlockGuildFromRaid clears from DB and redis', async () => {
    await unlockGuildFromRaid('g1');
    expect(container.prisma.raidLockdown.deleteMany).toHaveBeenCalled();
    expect(container.redis.del).toHaveBeenCalled();
  });

  it('scheduleRaidUnlock enqueues a rabbitmq job', () => {
    const at = new Date(Date.now() + 10000);
    scheduleRaidUnlock('g1', GuildVerificationLevel.Medium, at);
    expect(enqueueJob).toHaveBeenCalled();
  });
});
