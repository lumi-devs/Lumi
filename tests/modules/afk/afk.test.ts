import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAfkEntry,
  setAfkEntry,
  clearAfkEntry,
  clearAllAfkForUser,
  setAfkCooldown,
  isAfkOnCooldown,
  addAfkMention,
  getAfkMentions
} from '#modules/afk/data/afk.js';
import { container } from '@sapphire/framework';

vi.mock('@sapphire/framework', () => ({
  container: {
    redis: {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      scan: vi.fn(),
      multi: vi.fn().mockReturnThis(),
      lpush: vi.fn().mockReturnThis(),
      ltrim: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(),
      lrange: vi.fn(),
      exists: vi.fn(),
      set: vi.fn()
    },
    prisma: {
      afkEntry: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn()
      }
    },
    logger: {
      error: vi.fn(),
      warn: vi.fn()
    }
  }
}));

vi.mock('#modules/afk/index.js', () => ({
  sanitizeReason: vi.fn((s) => s)
}));

describe('AFK Data Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAfkEntry returns cached entry if exists', async () => {
    (container.redis.get as any).mockResolvedValue(JSON.stringify({ since: new Date().toISOString(), reason: 'lunch' }));
    const result = await getAfkEntry('guild-1', 'user-1');
    expect(result).toBeDefined();
    expect(result!.reason).toBe('lunch');
    expect(container.prisma.afkEntry.findUnique).not.toHaveBeenCalled();
  });

  it('setAfkEntry upserts entry in DB and caches it', async () => {
    const mockEntry = { guildId: 'g1', userId: 'u1', reason: 'brb', since: new Date() };
    (container.prisma.afkEntry.upsert as any).mockResolvedValue(mockEntry);

    const result = await setAfkEntry('g1', 'u1', 'brb');
    expect(result).toBe(mockEntry);
    expect(container.redis.setex).toHaveBeenCalled();
  });

  it('clearAfkEntry deletes from DB and redis', async () => {
    (container.prisma.afkEntry.delete as any).mockResolvedValue({});
    const res = await clearAfkEntry('g1', 'u1');
    expect(res).toBe(true);
    expect(container.prisma.afkEntry.delete).toHaveBeenCalled();
    expect(container.redis.del).toHaveBeenCalled();
  });

  it('clearAllAfkForUser handles multiple guild afk entries', async () => {
    (container.prisma.afkEntry.deleteMany as any).mockResolvedValue({ count: 2 });
    (container.redis.scan as any).mockResolvedValueOnce(['0', ['key1', 'key2']]).mockResolvedValueOnce(['0', []]);
    
    const count = await clearAllAfkForUser('u1');
    expect(count).toBe(2);
    expect(container.redis.del).toHaveBeenCalledWith('key1', 'key2');
  });

  it('cooldowns check correctly', async () => {
    (container.redis.exists as any).mockResolvedValue(1);
    const res = await isAfkOnCooldown('cd-key');
    expect(res).toBe(true);
  });

  it('sets cooldown', async () => {
    await setAfkCooldown('cd-key', 5000);
    expect(container.redis.set).toHaveBeenCalledWith('cd-key', '1', 'PX', 5000);
  });

  it('adds and gets mentions', async () => {
    const mockMention = { authorId: 'u2', authorName: 'Bob', channelId: 'c1', messageId: 'm1', ts: 100 };
    await addAfkMention('g1', 'u1', mockMention);
    expect(container.redis.multi).toHaveBeenCalled();
    
    (container.redis.lrange as any).mockResolvedValue([JSON.stringify(mockMention)]);
    const mentions = await getAfkMentions('g1', 'u1');
    expect(mentions.length).toBe(1);
    expect(mentions[0].authorId).toBe('u2');
  });
});
