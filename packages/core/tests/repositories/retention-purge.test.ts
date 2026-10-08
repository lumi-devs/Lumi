import { describe, it, expect, vi, beforeEach } from "bun:test";
import { createMockPrismaClient } from "../mocks/prisma.js";
import { AuditRepository } from "#lib/prisma/repositories/AuditRepository.js";
import { ConfigHistoryRepository } from "#lib/prisma/repositories/ConfigHistoryRepository.js";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";
import { AppealRepository } from "#modules/mod/data/AppealRepository.js";

function mockLogger(): import("@lumi/shared").ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as import("@lumi/shared").ILogger;
}

function mockValkey() {
  return {} as any;
}

function mockDb() {
  return { ensureGuild: vi.fn().mockResolvedValue(undefined) } as any;
}

const OLD = new Date("2020-01-01T00:00:00.000Z");
const CUTOFF = new Date("2025-01-01T00:00:00.000Z");
const RECENT = new Date("2026-09-01T00:00:00.000Z");

describe("AuditRepository.purgeOldEntries", () => {
  it("deletes in batches and stops once fewer than a full batch is returned", async () => {
    const prisma = createMockPrismaClient();
    (prisma as any).auditLedger.$seed(
      Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        guildId: "g",
        userId: "u",
        action: "a",
        platform: "discord",
        details: null,
        createdAt: OLD,
      })),
    );
    const repo = new AuditRepository(prisma as any, mockValkey(), mockLogger(), mockDb());

    const deleted = await repo.purgeOldEntries(CUTOFF, { batchSize: 2 });

    expect(deleted).toBe(5);
    expect((prisma as any).auditLedger.$all()).toHaveLength(0);
  });

  it("never deletes rows at or after the cutoff", async () => {
    const prisma = createMockPrismaClient();
    (prisma as any).auditLedger.$seed([
      { id: 1, guildId: "g", userId: "u", action: "a", platform: "discord", details: null, createdAt: OLD },
      { id: 2, guildId: "g", userId: "u", action: "a", platform: "discord", details: null, createdAt: RECENT },
    ]);
    const repo = new AuditRepository(prisma as any, mockValkey(), mockLogger(), mockDb());

    const deleted = await repo.purgeOldEntries(CUTOFF);

    expect(deleted).toBe(1);
    expect((prisma as any).auditLedger.$all().map((r: any) => r.id)).toEqual([2]);
  });
});

describe("ConfigHistoryRepository.purgeOldEntries", () => {
  it("deletes only rows older than the cutoff, in batches", async () => {
    const prisma = createMockPrismaClient();
    (prisma as any).moduleConfigHistory.$seed([
      { id: 1, guildId: "g", moduleName: "m", key: "k", oldValue: null, newValue: {}, actorId: "a", createdAt: OLD },
      { id: 2, guildId: "g", moduleName: "m", key: "k", oldValue: null, newValue: {}, actorId: "a", createdAt: OLD },
      { id: 3, guildId: "g", moduleName: "m", key: "k", oldValue: null, newValue: {}, actorId: "a", createdAt: RECENT },
    ]);
    const repo = new ConfigHistoryRepository(prisma as any, mockValkey(), mockLogger(), mockDb());

    const deleted = await repo.purgeOldEntries(CUTOFF, { batchSize: 1 });

    expect(deleted).toBe(2);
    expect((prisma as any).moduleConfigHistory.$all().map((r: any) => r.id)).toEqual([3]);
  });
});

describe("ModerationRepository.purgeOldCases", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: ModerationRepository;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    repo = new ModerationRepository(prisma as any, mockValkey(), mockLogger(), mockDb());
  });

  it("never purges an active case, no matter how old", async () => {
    (prisma as any).moderationCase.$seed([
      { id: 1, guildId: "g", caseNumber: 1, userId: "u", moderatorId: "m", action: "ban", active: true, createdAt: OLD, expiresAt: null },
      { id: 2, guildId: "g", caseNumber: 2, userId: "u", moderatorId: "m", action: "ban", active: false, createdAt: OLD, expiresAt: null },
    ]);

    const deleted = await repo.purgeOldCases(CUTOFF);

    expect(deleted).toBe(1);
    const remaining = (prisma as any).moderationCase.$all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(1);
    expect(remaining[0].active).toBe(true);
  });

  it("leaves inactive cases newer than the cutoff alone", async () => {
    (prisma as any).moderationCase.$seed([
      { id: 1, guildId: "g", caseNumber: 1, userId: "u", moderatorId: "m", action: "ban", active: false, createdAt: RECENT, expiresAt: null },
    ]);

    const deleted = await repo.purgeOldCases(CUTOFF);

    expect(deleted).toBe(0);
    expect((prisma as any).moderationCase.$all()).toHaveLength(1);
  });
});

describe("AppealRepository.purgeOldAppeals", () => {
  it("never purges a pending appeal, only resolved ones past the cutoff", async () => {
    const prisma = createMockPrismaClient();
    (prisma as any).appeal.$seed([
      { id: 1, guildId: "g", userId: "u", caseId: 1, status: "pending", message: "m", createdAt: OLD },
      { id: 2, guildId: "g", userId: "u", caseId: 2, status: "approved", message: "m", createdAt: OLD },
      { id: 3, guildId: "g", userId: "u", caseId: 3, status: "denied", message: "m", createdAt: RECENT },
    ]);
    const repo = new AppealRepository(prisma as any, mockValkey(), mockLogger(), mockDb());

    const deleted = await repo.purgeOldAppeals(CUTOFF);

    expect(deleted).toBe(1);
    const remaining = (prisma as any).appeal.$all().map((r: any) => r.id).sort();
    expect(remaining).toEqual([1, 3]);
  });
});
