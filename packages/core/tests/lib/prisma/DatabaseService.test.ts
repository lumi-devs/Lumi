import { describe, it, expect, vi, beforeEach } from "bun:test";
import { DatabaseService } from "#lib/prisma/DatabaseService.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("DatabaseService guild lifecycle", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let db: DatabaseService;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    const mockRedis: any = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    };
    const mockLogger: any = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() };
    db = new DatabaseService(prisma as any, mockRedis, mockLogger);
  });

  it("markGuildLeft sets leftAt on an existing guild row", async () => {
    prisma.$seed("guild", [{ id: "g1", leftAt: null }]);

    await db.markGuildLeft("g1");

    const [row] = prisma.$all("guild");
    expect(row!["leftAt"]).toBeInstanceOf(Date);
  });

  it("markGuildLeft swallows a missing row instead of throwing", async () => {
    await expect(db.markGuildLeft("missing")).resolves.toBeUndefined();
    expect(prisma.$all("guild")).toHaveLength(0);
  });

  it("markGuildRejoined clears leftAt on an existing row", async () => {
    prisma.$seed("guild", [{ id: "g1", leftAt: new Date() }]);

    await db.markGuildRejoined("g1");

    const [row] = prisma.$all("guild");
    expect(row!["leftAt"]).toBeNull();
  });

  it("markGuildRejoined creates a fresh row with no leftAt for a brand-new guild", async () => {
    await db.markGuildRejoined("new-guild");

    const [row] = prisma.$all("guild");
    expect(row).toMatchObject({ id: "new-guild" });
  });

  it("round-trips: leave then rejoin clears the departure mark", async () => {
    prisma.$seed("guild", [{ id: "g1", leftAt: null }]);

    await db.markGuildLeft("g1");
    expect(prisma.$all("guild")[0]!["leftAt"]).toBeInstanceOf(Date);

    await db.markGuildRejoined("g1");
    expect(prisma.$all("guild")[0]!["leftAt"]).toBeNull();
  });

  it("findDepartedGuildIds returns only ids that are currently marked departed", async () => {
    prisma.$seed("guild", [
      { id: "g1", leftAt: new Date() },
      { id: "g2", leftAt: null },
      { id: "g3", leftAt: new Date() },
    ]);

    const departed = await db.findDepartedGuildIds(["g1", "g2", "g3", "g4"]);
    expect(departed.sort()).toEqual(["g1", "g3"]);
  });

  it("findActiveGuildIds returns only ids with no departure mark", async () => {
    prisma.$seed("guild", [
      { id: "g1", leftAt: new Date() },
      { id: "g2", leftAt: null },
      { id: "g3", leftAt: null },
    ]);

    const active = await db.findActiveGuildIds();
    expect(active.sort()).toEqual(["g2", "g3"]);
  });

  it("purgeDepartedGuilds deletes rows past the cutoff and returns their ids", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const recent = new Date(Date.now() - 5 * 86_400_000);
    prisma.$seed("guild", [
      { id: "g1", leftAt: old },
      { id: "g2", leftAt: recent },
      { id: "g3", leftAt: null },
    ]);

    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const purged = await db.purgeDepartedGuilds(cutoff);

    expect(purged).toEqual(["g1"]);
    expect(prisma.$all("guild").map((r) => r["id"])).toEqual(["g2", "g3"]);
  });
});
