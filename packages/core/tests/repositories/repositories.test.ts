import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModerationRepository } from '#lib/prisma/repositories/ModerationRepository.js';

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
