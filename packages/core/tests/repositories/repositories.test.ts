import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModerationRepository } from '#lib/prisma/repositories/ModerationRepository.js';
import { ConfigRepository } from '#lib/prisma/repositories/ConfigRepository.js';
import { GuildKVRepository } from '#lib/prisma/repositories/GuildKVRepository.js';
import { ModNoteRepository } from '#lib/prisma/repositories/ModNoteRepository.js';
import { container } from '@sapphire/framework';

describe('ModerationRepository Tests', () => {
  let mockPrisma: any;
  let repo: ModerationRepository;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn((cb) => cb(mockPrisma)),
      moderationCase: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn()
      },
      guildCaseCounter: {
        upsert: vi.fn(),
        update: vi.fn()
      }
    };
    repo = new ModerationRepository(mockPrisma as any, {} as any, {} as any, {} as any);
  });

  it('createModerationCase calculates case number and creates record in transaction', async () => {
    mockPrisma.moderationCase.findFirst.mockResolvedValue({ caseNumber: 5 });
    mockPrisma.guildCaseCounter.upsert.mockResolvedValue({ guildId: 'g1', next: 7 });
    mockPrisma.moderationCase.create.mockResolvedValue({ id: 1, caseNumber: 6 });

    const result = await repo.createModerationCase({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'm1',
      action: 'warn',
      reason: 'test'
    });

    expect(result.caseNumber).toBe(6);
    expect(mockPrisma.moderationCase.create).toHaveBeenCalledWith({
      data: {
        guildId: 'g1',
        caseNumber: 6,
        userId: 'u1',
        moderatorId: 'm1',
        action: 'warn',
        reason: 'test',
        duration: undefined,
        expiresAt: undefined,
        active: true,
      }
    });
  });

  it('createModerationCase handles null maxCase and updates counter when caseNumber >= counter.next', async () => {
    mockPrisma.moderationCase.findFirst.mockResolvedValue(null);
    mockPrisma.guildCaseCounter.upsert.mockResolvedValue({ guildId: 'g1', next: 1 });
    mockPrisma.moderationCase.create.mockResolvedValue({ id: 2, caseNumber: 1 });

    const now = new Date();
    const result = await repo.createModerationCase({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'm1',
      action: 'mute',
      reason: 'spam',
      durationSeconds: 3600,
      expiresAt: now,
    });

    expect(mockPrisma.guildCaseCounter.update).toHaveBeenCalledWith({
      where: { guildId: 'g1' },
      data: { next: 2 },
    });
    expect(result.caseNumber).toBe(1);
  });

  it('getModerationCases queries cases by guild and user with optional action', async () => {
    mockPrisma.moderationCase.findMany.mockResolvedValue([{ id: 1 }]);
    const casesWithAction = await repo.getModerationCases('g1', 'u1', 'warn');
    expect(casesWithAction).toHaveLength(1);
    expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', userId: 'u1', action: 'warn' },
      orderBy: { caseNumber: 'desc' },
      take: 10
    });

    await repo.getModerationCases('g1', 'u1');
    expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', userId: 'u1' },
      orderBy: { caseNumber: 'desc' },
      take: 10
    });
  });

  it('getActiveCases queries active cases with optional action filter', async () => {
    mockPrisma.moderationCase.findMany.mockResolvedValue([{ id: 1, active: true }]);
    const activeCases = await repo.getActiveCases('g1', 'u1', 'mute');
    expect(activeCases).toHaveLength(1);
    expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', userId: 'u1', active: true, action: 'mute' },
      orderBy: { caseNumber: 'desc' },
    });

    await repo.getActiveCases('g1', 'u1');
    expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', userId: 'u1', active: true },
      orderBy: { caseNumber: 'desc' },
    });
  });

  it('getModerationCase queries single case by guild and case number', async () => {
    mockPrisma.moderationCase.findUnique.mockResolvedValue({ id: 10, caseNumber: 3 });
    const c = await repo.getModerationCase('g1', 3);
    expect(c).toEqual({ id: 10, caseNumber: 3 });
    expect(mockPrisma.moderationCase.findUnique).toHaveBeenCalledWith({
      where: { uq_cases_guild_number: { guildId: 'g1', caseNumber: 3 } },
    });
  });

  it('getModerationCaseById queries single case by primary key id', async () => {
    mockPrisma.moderationCase.findUnique.mockResolvedValue({ id: 42 });
    const c = await repo.getModerationCaseById(42);
    expect(c).toEqual({ id: 42 });
    expect(mockPrisma.moderationCase.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
    });
  });

  it('iterateActiveExpiringCases keyset-paginates active cases with non-null expiry', async () => {
    mockPrisma.moderationCase.findMany.mockResolvedValue([{ id: 1, expiresAt: new Date() }]);

    const pages = [];
    for await (const page of repo.iterateActiveExpiringCases()) pages.push(page);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
    expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { active: true, expiresAt: { not: null } },
      orderBy: { id: 'asc' },
      take: 500,
    });
  });

  it('iterateActiveExpiringCases advances the cursor past the last id of a full page', async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ id: i + 1 }));
    mockPrisma.moderationCase.findMany
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([{ id: 501 }]);

    const seen = [];
    for await (const page of repo.iterateActiveExpiringCases()) seen.push(page.length);

    expect(seen).toEqual([500, 1]);
    expect(mockPrisma.moderationCase.findMany).toHaveBeenLastCalledWith({
      where: { active: true, expiresAt: { not: null } },
      orderBy: { id: 'asc' },
      take: 500,
      cursor: { id: 500 },
      skip: 1,
    });
  });

  it('liftModerationCase updates active status to false', async () => {
    mockPrisma.moderationCase.update.mockResolvedValue({ id: 5, active: false });
    const res = await repo.liftModerationCase(5);
    expect(res.active).toBe(false);
    expect(mockPrisma.moderationCase.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { active: false },
    });
  });

  it('updateCaseReason updates case reason', async () => {
    mockPrisma.moderationCase.update.mockResolvedValue({ id: 5, reason: 'new reason' });
    await repo.updateCaseReason(5, 'new reason');
    expect(mockPrisma.moderationCase.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { reason: 'new reason' },
    });
  });

  it('deleteModerationCase returns boolean status', async () => {
    mockPrisma.moderationCase.deleteMany.mockResolvedValue({ count: 1 });
    const success = await repo.deleteModerationCase('g1', 5);
    expect(success).toBe(true);

    mockPrisma.moderationCase.deleteMany.mockResolvedValue({ count: 0 });
    const fail = await repo.deleteModerationCase('g1', 99);
    expect(fail).toBe(false);
  });

  it('anonymizeUser updates user and moderator cases for GDPR', async () => {
    mockPrisma.moderationCase.updateMany.mockResolvedValue({ count: 2 });
    await repo.anonymizeUser('user123');
    expect(mockPrisma.moderationCase.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user123' },
      data: { userId: '0' },
    });
    expect(mockPrisma.moderationCase.updateMany).toHaveBeenCalledWith({
      where: { moderatorId: 'user123' },
      data: { moderatorId: '0' },
    });
  });
});

describe('ConfigRepository Batch Operations', () => {
  let mockPrisma: any;
  let mockRedis: any;
  let mockLogger: any;
  let mockDb: any;
  let mockInvalidation: any;
  let repo: ConfigRepository;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
      guildModuleConfig: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    };
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
    };
    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    mockDb = {};
    mockInvalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };
    (container as any).invalidation = mockInvalidation;

    repo = new ConfigRepository(mockPrisma, mockRedis, mockLogger, mockDb);
  });

  it('getModuleConfigs returns empty object when keys array is empty', async () => {
    const res = await repo.getModuleConfigs('g1', 'core', []);
    expect(res).toEqual({});
    expect(mockPrisma.guildModuleConfig.findMany).not.toHaveBeenCalled();
  });

  it('getModuleConfigs returns matching keys from cached or fetched config', async () => {
    mockPrisma.guildModuleConfig.findMany.mockResolvedValue([
      { configKey: 'prefix', value: '!' },
      { configKey: 'channel', value: '123' },
      { configKey: 'role', value: '456' },
    ]);

    const res = await repo.getModuleConfigs('g1', 'core', ['prefix', 'role', 'missing']);
    expect(res).toEqual({
      prefix: '!',
      role: '456',
    });
    expect(mockPrisma.guildModuleConfig.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', moduleName: 'core' },
    });
  });

  it('setModuleConfigsMany does nothing when entries object is empty', async () => {
    await repo.setModuleConfigsMany('g1', 'core', {});
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockInvalidation.invalidate).not.toHaveBeenCalled();
  });

  it('setModuleConfigsMany upserts all entries in single transaction and invalidates caches', async () => {
    await repo.setModuleConfigsMany('g1', 'core', {
      prefix: '?',
      logging: true,
    });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockInvalidation.invalidate).toHaveBeenCalledWith(
      'lumi:cfg:core:guild:g1',
      'lumi:cfg:all:guild:g1',
    );
  });
});

describe('GuildKVRepository Batch Operations', () => {
  let mockPrisma: any;
  let mockRedis: any;
  let mockLogger: any;
  let mockDb: any;
  let repo: GuildKVRepository;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
      moduleData: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    };
    mockRedis = {};
    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    mockDb = {};

    repo = new GuildKVRepository(mockPrisma, mockRedis, mockLogger, mockDb);
  });

  it('getModuleDataMany returns empty map when targets array is empty', async () => {
    const res = await repo.getModuleDataMany('g1', 'tags', []);
    expect(res.size).toBe(0);
    expect(mockPrisma.moduleData.findMany).not.toHaveBeenCalled();
  });

  it('getModuleDataMany batches queries and returns map keyed by targetId:key', async () => {
    mockPrisma.moduleData.findMany.mockResolvedValue([
      { targetId: 't1', key: 'name', value: 'Alpha' },
      { targetId: 't2', key: 'name', value: 'Beta' },
    ]);

    const res = await repo.getModuleDataMany('g1', 'tags', [
      { targetId: 't1', key: 'name' },
      { targetId: 't2', key: 'name' },
    ]);

    expect(res.get('t1:name')).toBe('Alpha');
    expect(res.get('t2:name')).toBe('Beta');
    expect(mockPrisma.moduleData.findMany).toHaveBeenCalledWith({
      where: {
        guildId: 'g1',
        moduleName: 'tags',
        OR: [
          { targetId: 't1', key: 'name' },
          { targetId: 't2', key: 'name' },
        ],
      },
    });
  });

  it('setModuleDataMany returns 0 when entries array is empty', async () => {
    const count = await repo.setModuleDataMany('g1', 'tags', []);
    expect(count).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('setModuleDataMany upserts entries in single transaction and returns count', async () => {
    const count = await repo.setModuleDataMany('g1', 'tags', [
      { targetId: 't1', key: 'name', value: 'Alpha' },
      { targetId: 't2', key: 'name', value: 'Beta' },
    ]);

    expect(count).toBe(2);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});

describe('ModNoteRepository GDPR erasure', () => {
  let mockPrisma: any;
  let repo: ModNoteRepository;

  beforeEach(() => {
    mockPrisma = {
      modNote: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repo = new ModNoteRepository(mockPrisma as any, {} as any, {} as any, {} as any);
  });

  it('deleteUserData removes notes where the user is the subject', async () => {
    await repo.deleteUserData('u1');

    expect(mockPrisma.modNote.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('deleteUserData anonymizes authorId on notes the user wrote about someone else', async () => {
    await repo.deleteUserData('u1');

    expect(mockPrisma.modNote.updateMany).toHaveBeenCalledWith({
      where: { authorId: 'u1' },
      data: { authorId: '0' },
    });
  });
});
