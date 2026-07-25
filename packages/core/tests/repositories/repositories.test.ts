import { describe, it, expect, vi } from 'vitest';
import { ModerationRepository } from '#lib/prisma/repositories/ModerationRepository.js';

describe('ModerationRepository Tests', () => {
  const mockPrisma = {
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

  const repo = new ModerationRepository(mockPrisma as any);

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
    expect(mockPrisma.moderationCase.create).toHaveBeenCalled();
  });

  it('getModerationCases queries cases by guild and user', async () => {
    mockPrisma.moderationCase.findMany.mockResolvedValue([{ id: 1 }]);
    const cases = await repo.getModerationCases('g1', 'u1', 'warn');
    expect(cases).toHaveLength(1);
    expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', userId: 'u1', action: 'warn' },
      orderBy: { caseNumber: 'desc' },
      take: 10
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
    expect(mockPrisma.moderationCase.updateMany).toHaveBeenCalledTimes(2);
  });
});
