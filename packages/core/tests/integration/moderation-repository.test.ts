import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type Valkey from "iovalkey";
import { DatabaseService } from "#lib/prisma/DatabaseService.js";
import type { DatabaseClient } from "#lib/prisma/client.js";
import { createTestValkey, integrationDescribe, requireTestDatabaseUrl } from "./setup.js";

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
} as unknown as import("@sapphire/framework").ILogger;

let guildIdCounter = 0;

function uniqueGuildId(): string {
  // VarChar(20), digits only - looks like a real Discord snowflake.
  guildIdCounter++;
  return `9${Date.now()}${guildIdCounter}`.slice(0, 19);
}

integrationDescribe("ModerationRepository (real Postgres)", () => {
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
    // Cascades to ModerationCase/GuildCaseCounter (onDelete: Cascade) - never
    // a table-wide delete, only the exact guild rows this test created.
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

  it("creates cases with an incrementing per-guild case number", async () => {
    const guildId = trackedGuildId();
    const userId = "111111111111111111";
    const moderatorId = "222222222222222222";

    const first = await db.moderation.createModerationCase({
      guildId,
      userId,
      moderatorId,
      action: "warn",
      reason: "first warning",
    });
    const second = await db.moderation.createModerationCase({
      guildId,
      userId,
      moderatorId,
      action: "mute",
      reason: "muted",
      durationSeconds: 3600,
    });

    expect(first.caseNumber).toBe(1);
    expect(second.caseNumber).toBe(2);
    expect(first.active).toBe(true);
  });

  it("lists and counts cases for a guild/user, newest first", async () => {
    const guildId = trackedGuildId();
    const userId = "333333333333333333";
    const moderatorId = "444444444444444444";

    await db.moderation.createModerationCase({ guildId, userId, moderatorId, action: "warn" });
    await db.moderation.createModerationCase({ guildId, userId, moderatorId, action: "warn" });
    await db.moderation.createModerationCase({ guildId, userId, moderatorId, action: "ban" });

    const { cases, total } = await db.moderation.listCases(guildId, { userId });
    expect(total).toBe(3);
    expect(cases.map((c) => c.caseNumber)).toEqual([3, 2, 1]);

    const warnCount = await db.moderation.countModerationCases(guildId, userId, "warn");
    expect(warnCount).toBe(2);
  });

  it("lifts a case, clearing it from the active set", async () => {
    const guildId = trackedGuildId();
    const userId = "555555555555555555";
    const moderatorId = "666666666666666666";

    const created = await db.moderation.createModerationCase({
      guildId,
      userId,
      moderatorId,
      action: "mute",
      durationSeconds: 60,
    });

    const activeBefore = await db.moderation.getActiveCases(guildId, userId);
    expect(activeBefore.map((c) => c.id)).toContain(created.id);

    const lifted = await db.moderation.liftModerationCase(created.id);
    expect(lifted.active).toBe(false);

    const activeAfter = await db.moderation.getActiveCases(guildId, userId);
    expect(activeAfter.map((c) => c.id)).not.toContain(created.id);
  });

  it("round-trips a single case lookup by guild + case number", async () => {
    const guildId = trackedGuildId();
    const userId = "777777777777777777";
    const moderatorId = "888888888888888888";

    const created = await db.moderation.createModerationCase({
      guildId,
      userId,
      moderatorId,
      action: "kick",
      reason: "test kick",
    });

    const fetched = await db.moderation.getModerationCase(guildId, created.caseNumber);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.reason).toBe("test kick");
  });
});
