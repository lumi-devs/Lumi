import { describe, it, expect, vi, beforeEach } from "bun:test";
import { AuditRepository } from "#lib/prisma/repositories/AuditRepository.js";
import { ConfigHistoryRepository } from "#lib/prisma/repositories/ConfigHistoryRepository.js";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";
import { AppealRepository } from "#modules/mod/data/AppealRepository.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { createMockPrismaClient } from "../mocks/prisma.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

const GUILD_ID = "123456789012345678";
const noopLogger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const noDb: any = { ensureGuild: vi.fn().mockResolvedValue(undefined) };

/** Walks every page via `nextCursor` until exhausted, returning the ids in visit order. */
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

describe("keyset pagination - AuditRepository.listAuditLogs", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: AuditRepository;

  beforeEach(() => {
    repositoryCache.clear();
    prisma = createMockPrismaClient();
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
        // Every `tieEvery`th row shares the exact same createdAt to exercise
        // the (createdAt, id) tie-break.
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
    // Ties break on id descending: within the shared createdAt group, higher
    // ids must still come first.
    const tiedIds = [3, 6, 9, 12, 15].sort((a, b) => b - a);
    const positions = tiedIds.map((id) => ids.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("omits total in cursor mode but returns it in page mode", async () => {
    seed(3);
    const pageMode = await repo.listAuditLogs({ guildId: GUILD_ID, skip: 0, take: 2 });
    expect(pageMode.total).toBe(3);
    expect(pageMode.nextCursor).not.toBeNull();

    const cursorPage = await repo.listAuditLogs({
      guildId: GUILD_ID,
      take: 2,
      cursor: pageMode.nextCursor!,
    });
    expect(cursorPage.total).toBeUndefined();
  });

  it("returns null nextCursor on the last page mode page", async () => {
    seed(2);
    const res = await repo.listAuditLogs({ guildId: GUILD_ID, skip: 0, take: 25 });
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
    repositoryCache.clear();
    prisma = createMockPrismaClient();
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
    repositoryCache.clear();
    prisma = createMockPrismaClient();
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
    repositoryCache.clear();
    prisma = createMockPrismaClient();
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
