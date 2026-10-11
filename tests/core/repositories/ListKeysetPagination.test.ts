import { describe, it, expect, vi, beforeEach } from "bun:test";
import { AuditRepository } from "#src/lib/prisma/repositories/AuditRepository.js";
import { ConfigHistoryRepository } from "#src/lib/prisma/repositories/ConfigHistoryRepository.js";
import { ModerationRepository } from "#src/lib/prisma/repositories/ModerationRepository.js";
import { AppealRepository } from "#src/modules/mod/data/AppealRepository.js";
import { repositoryCache } from "#src/lib/cache/CacheStore.js";
import { createMockPrismaClient } from "../mocks/Prisma.js";

vi.mock("#src/observability/Index.ts", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

const GUILD_ID = "123456789012345678";
const noopLogger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const noDb: any = { ensureGuild: vi.fn().mockResolvedValue(undefined) };

async function collectAllPages<T extends { id: number }>(
  pageSize: number,
  fetchPage: (cursor: string | undefined) => Promise<{ rows: T[]; nextCursor: string | null }>,
): Promise<number[]> {
  const seen: number[] = [];
  let cursor: string | undefined;
  let guard = 0;
  for (;;) {
    if (++guard > 100) throw new Error("pagination did not terminate");
    const { rows, nextCursor } = await fetchPage(cursor);
    expect(rows.length).toBeLessThanOrEqual(pageSize);
    seen.push(...rows.map((r) => r.id));
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return seen;
}

function freshPrisma() {
  repositoryCache.clear();
  return createMockPrismaClient();
}

describe("keyset pagination - AuditRepository.listAuditLogs", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: AuditRepository;

  beforeEach(() => {
    prisma = freshPrisma();
    repo = new AuditRepository(prisma as any, {} as any, noopLogger, noDb);
  });

  function seed(count: number, tieEvery = 0) {
    const tieAt = new Date("2026-01-05T00:00:00.000Z");
    prisma.$seed(
      "auditLedger",
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        guildId: GUILD_ID,
        userId: "111111111111111111",
        action: "config.set",
        platform: "web",
        details: null,

        createdAt: tieEvery && (i + 1) % tieEvery === 0 ? tieAt : new Date(2026, 0, i + 1),
      })),
    );
  }

  it("visits every row exactly once, newest first, across page boundaries", async () => {
    seed(23);
    const ids = await collectAllPages(5, async (cursor) => {
      const { entries, nextCursor } = await repo.listAuditLogs({
        guildId: GUILD_ID,
        take: 5,
        cursor,
      });
      return { rows: entries, nextCursor };
    });

    expect(ids).toEqual(Array.from({ length: 23 }, (_, i) => 23 - i));
    expect(new Set(ids).size).toBe(23);
  });

  it("visits every row exactly once when many rows share the same createdAt", async () => {
    seed(17, 3);
    const ids = await collectAllPages(4, async (cursor) => {
      const { entries, nextCursor } = await repo.listAuditLogs({
        guildId: GUILD_ID,
        take: 4,
        cursor,
      });
      return { rows: entries, nextCursor };
    });

    expect(ids.length).toBe(17);
    expect(new Set(ids).size).toBe(17);

    const tiedIds = [3, 6, 9, 12, 15].sort((a, b) => b - a);
    const positions = tiedIds.map((id) => ids.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("returns total on the first page but omits it once a cursor is supplied", async () => {
    seed(3);
    const firstPage = await repo.listAuditLogs({ guildId: GUILD_ID, take: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.nextCursor).not.toBeNull();

    const cursorPage = await repo.listAuditLogs({
      guildId: GUILD_ID,
      take: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(cursorPage.total).toBeUndefined();
  });

  it("returns null nextCursor on the last first page", async () => {
    seed(2);
    const res = await repo.listAuditLogs({ guildId: GUILD_ID, take: 25 });
    expect(res.total).toBe(2);
    expect(res.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor", async () => {
    seed(1);
    await expect(
      repo.listAuditLogs({ guildId: GUILD_ID, cursor: "not-a-real-cursor" }),
    ).rejects.toThrow("Invalid pagination cursor");
  });
});

describe("keyset pagination - ModerationRepository.listCases (single-key caseNumber cursor)", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: ModerationRepository;

  beforeEach(() => {
    prisma = freshPrisma();
    repo = new ModerationRepository(prisma as any, {} as any, noopLogger, noDb);
  });

  function seed(count: number) {
    prisma.$seed(
      "moderationCase",
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        guildId: GUILD_ID,
        caseNumber: i + 1,
        userId: "111111111111111111",
        moderatorId: "222222222222222222",
        action: "warn",
        reason: null,
        duration: null,
        expiresAt: null,
        active: true,
        createdAt: new Date(2026, 0, i + 1),
      })),
    );
  }

  it("visits every case exactly once, newest caseNumber first", async () => {
    seed(19);
    const ids = await collectAllPages(6, async (cursor) => {
      const { cases, nextCursor } = await repo.listCases(GUILD_ID, { take: 6, cursor });
      return { rows: cases, nextCursor };
    });

    expect(ids).toEqual(Array.from({ length: 19 }, (_, i) => 19 - i));
    expect(new Set(ids).size).toBe(19);
  });

  it("rejects a malformed cursor", async () => {
    seed(1);
    await expect(
      repo.listCases(GUILD_ID, { cursor: "garbage" }),
    ).rejects.toThrow("Invalid pagination cursor");
  });
});

describe("keyset pagination - AppealRepository.listForGuild", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: AppealRepository;

  beforeEach(() => {
    prisma = freshPrisma();
    repo = new AppealRepository(prisma as any, {} as any, noopLogger, noDb);
  });

  function seed(count: number, tieEvery = 0) {
    const tieAt = new Date("2026-01-05T00:00:00.000Z");
    prisma.$seed(
      "appeal",
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        guildId: GUILD_ID,
        userId: "111111111111111111",
        caseId: i + 1,
        status: "pending",
        message: "please",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: tieEvery && (i + 1) % tieEvery === 0 ? tieAt : new Date(2026, 0, i + 1),
      })),
    );
  }

  it("visits every appeal exactly once across ties", async () => {
    seed(13, 4);
    const ids = await collectAllPages(3, async (cursor) => {
      const { appeals, nextCursor } = await repo.listForGuild(GUILD_ID, { take: 3, cursor });
      return { rows: appeals, nextCursor };
    });

    expect(ids.length).toBe(13);
    expect(new Set(ids).size).toBe(13);
  });

  it("rejects a malformed cursor", async () => {
    seed(1);
    await expect(
      repo.listForGuild(GUILD_ID, { cursor: "garbage" }),
    ).rejects.toThrow("Invalid pagination cursor");
  });
});

describe("keyset pagination - ConfigHistoryRepository.listGuildConfigHistory", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: ConfigHistoryRepository;

  beforeEach(() => {
    prisma = freshPrisma();
    repo = new ConfigHistoryRepository(prisma as any, {} as any, noopLogger, noDb);
  });

  function seed(count: number, tieEvery = 0) {
    const tieAt = new Date("2026-01-05T00:00:00.000Z");
    prisma.$seed(
      "moduleConfigHistory",
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        guildId: GUILD_ID,
        moduleName: "mod",
        key: "logChannel",
        oldValue: "old",
        newValue: "new",
        actorId: "111111111111111111",
        createdAt: tieEvery && (i + 1) % tieEvery === 0 ? tieAt : new Date(2026, 0, i + 1),
      })),
    );
  }

  it("visits every entry exactly once across ties", async () => {
    seed(11, 5);
    const ids = await collectAllPages(4, async (cursor) => {
      const { entries, nextCursor } = await repo.listGuildConfigHistory(GUILD_ID, {
        take: 4,
        cursor,
      });
      return { rows: entries, nextCursor };
    });

    expect(ids.length).toBe(11);
    expect(new Set(ids).size).toBe(11);
  });

  it("rejects a malformed cursor", async () => {
    seed(1);
    await expect(
      repo.listGuildConfigHistory(GUILD_ID, { cursor: "garbage" }),
    ).rejects.toThrow("Invalid pagination cursor");
  });
});
