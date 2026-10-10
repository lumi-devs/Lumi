import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type Valkey from "iovalkey";
import { DatabaseService } from "@lumi/lib/prisma/database-service.js";
import type { DatabaseClient } from "@lumi/lib/prisma/client.js";
import { createTestValkey, integrationDescribe, requireTestDatabaseUrl } from "./setup.js";

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
} as unknown as import("@lumi/shared").ILogger;

let guildIdCounter = 0;

function uniqueGuildId(): string {
  guildIdCounter++;
  return `9${Date.now()}${guildIdCounter}`.slice(0, 19);
}

integrationDescribe("Audit log keyset pagination (real Postgres)", () => {
  let pool: Pool;
  let prisma: DatabaseClient;
  let valkey: Valkey;
  let db: DatabaseService;
  const guildIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: requireTestDatabaseUrl() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as unknown as DatabaseClient;
    valkey = createTestValkey();
    db = new DatabaseService(prisma, valkey, noopLogger);
  });

  afterEach(async () => {
    const ids = guildIds.splice(0);
    await Promise.all(
      ids.map((id) => prisma.guild.delete({ where: { id } }).catch(() => undefined)),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await valkey.quit();
  });

  function trackedGuildId(): string {
    const id = uniqueGuildId();
    guildIds.push(id);
    return id;
  }

  it("walks every audit row exactly once, newest first, with several rows sharing one createdAt", async () => {
    const guildId = trackedGuildId();
    const userId = "111111111111111111";
    await db.ensureGuild(guildId);

    // A batched flush inserts many rows with the exact same createdAt - the
    // scenario the (guildId, createdAt, id) index/tie-break exists for.
    const tieTimestamp = new Date("2026-01-01T00:00:00.000Z");
    const rows = [
      ...Array.from({ length: 6 }, () => ({
        guildId,
        userId,
        action: "config.set",
        platform: "web" as const,
        createdAt: tieTimestamp,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        guildId,
        userId,
        action: "config.set",
        platform: "web" as const,
        createdAt: new Date(tieTimestamp.getTime() + (i + 1) * 1000),
      })),
    ];
    await prisma.auditLedger.createMany({ data: rows });

    const seen: number[] = [];
    let cursor: string | undefined;
    let guard = 0;
    for (;;) {
      if (++guard > 50) throw new Error("pagination did not terminate");
      const { entries, nextCursor } = await db.audit.listAuditLogs({
        guildId,
        take: 3,
        cursor,
      });
      expect(entries.length).toBeLessThanOrEqual(3);
      seen.push(...entries.map((e) => e.id));
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    expect(seen.length).toBe(rows.length);
    expect(new Set(seen).size).toBe(rows.length);

    const all = await prisma.auditLedger.findMany({
      where: { guildId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(seen).toEqual(all.map((e) => e.id));
  });
});
