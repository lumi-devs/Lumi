import { describe, it, expect } from "bun:test";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";

// Backs the "do not break when refactoring" contract on
// ModerationRepository.createModerationCase: the counter reservation MUST stay
// a single atomic statement, so concurrent creates for one guild never hand
// out the same case number.
//
// We can't run a real Postgres row lock in a unit test, so we model the
// guarantee the implementation relies on: Postgres's own `ON CONFLICT ...
// DO UPDATE ... RETURNING` locks the counter row for the duration of that one
// statement, so two concurrent callers targeting the same guildId are
// serialized by the database, not by application code. That's modelled here
// with a per-guild async mutex held for the duration of the `$queryRaw` call
// (mirrors the row lock `ON CONFLICT` takes), plus a real uniqueness check on
// `(guildId, caseNumber)` in `moderationCase.create`, exactly like the DB
// constraint would (P2002).
//
// If a refactor moves the counter reservation outside that single atomic
// statement, two concurrent calls can observe the same `next` and either
// collide on the unique check or silently duplicate a case number - failing
// this test. That's the regression guard.

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/** Force the microtask queue to drain so concurrent calls actually interleave. */
const yieldOnce = () => new Promise<void>((r) => setImmediate(r));

class FakePrisma {
  private counters = new Map<string, number>(); // guildId -> next
  private cases: Array<{ guildId: string; caseNumber: number; id: number }> = [];
  private seq = 0;
  private locks = new Map<string, AsyncMutex>();

  private lockFor(guildId: string): AsyncMutex {
    let lock = this.locks.get(guildId);
    if (!lock) {
      lock = new AsyncMutex();
      this.locks.set(guildId, lock);
    }
    return lock;
  }

  // Models the single atomic `INSERT ... ON CONFLICT (guildId) DO UPDATE ...
  // RETURNING` statement: the read-modify-write of the counter row is
  // serialized per guildId, exactly like Postgres's own row-level lock.
  $queryRaw = async (
    sql: { values: readonly unknown[] },
  ): Promise<{ caseNumber: number }[]> => {
    const guildId = sql.values[0] as string;
    return this.lockFor(guildId).run(async () => {
      await yieldOnce();
      const current = this.counters.get(guildId);
      const next = current === undefined ? 2 : current + 1;
      this.counters.set(guildId, next);
      return [{ caseNumber: next - 1 }];
    });
  };

  moderationCase = {
    create: async ({
      data,
    }: {
      data: { guildId: string; caseNumber: number };
    }) => {
      await yieldOnce();
      const dup = this.cases.some(
        (c) => c.guildId === data.guildId && c.caseNumber === data.caseNumber,
      );
      if (dup) {
        throw new Error(
          `Unique constraint failed (guildId, caseNumber)=(${data.guildId}, ${data.caseNumber})`,
        );
      }
      const row = { ...data, id: ++this.seq };
      this.cases.push(row);
      return row;
    },
  };
}

function makeRepo(prisma: FakePrisma): ModerationRepository {
  // The repo only touches this.prisma and this.db.ensureGuild in
  // createModerationCase; the other constructor deps are unused on this path.
  return new ModerationRepository(
    prisma as unknown as never,
    {} as never,
    { error() {}, warn() {}, debug() {}, info() {} } as never,
    { ensureGuild: async () => {} } as never,
  );
}

describe("ModerationCase number allocation under concurrency", () => {
  it("hands out contiguous, unique case numbers for parallel creates on one guild", async () => {
    const prisma = new FakePrisma();
    const repo = makeRepo(prisma);
    const guildId = "guild-concurrent";

    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        repo.createModerationCase({
          guildId,
          userId: `u${i}`,
          moderatorId: "mod",
          action: "warn",
        }),
      ),
    );

    const numbers = results.map((c) => c.caseNumber).sort((a, b) => a - b);
    // No duplicates.
    expect(new Set(numbers).size).toBe(N);
    // Contiguous 1..N.
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it("keeps separate counters per guild", async () => {
    const prisma = new FakePrisma();
    const repo = makeRepo(prisma);

    const make = (guildId: string) =>
      repo.createModerationCase({
        guildId,
        userId: "u",
        moderatorId: "mod",
        action: "warn",
      });

    const [a1, b1, a2] = await Promise.all([
      make("guild-a"),
      make("guild-b"),
      make("guild-a"),
    ]);

    expect(a1.guildId).toBe("guild-a");
    expect(b1.caseNumber).toBe(1); // guild-b's first case
    // guild-a's two cases are 1 and 2 in some order.
    expect([a1.caseNumber, a2.caseNumber].sort()).toEqual([1, 2]);
  });

  it("handles high concurrency across multiple interleaved guilds without collisions", async () => {
    const prisma = new FakePrisma();
    const repo = makeRepo(prisma);

    const guilds = ["guild-1", "guild-2", "guild-3", "guild-4", "guild-5"];
    const casesPerGuild = 20;

    const allPromises = guilds.flatMap((guildId) =>
      Array.from({ length: casesPerGuild }, (_, i) =>
        repo.createModerationCase({
          guildId,
          userId: `user-${i}`,
          moderatorId: "mod",
          action: "mute",
        }),
      ),
    );

    const results = await Promise.all(allPromises);
    expect(results.length).toBe(guilds.length * casesPerGuild);

    for (const guildId of guilds) {
      const guildCases = results
        .filter((c) => c.guildId === guildId)
        .map((c) => c.caseNumber)
        .sort((a, b) => a - b);

      expect(guildCases.length).toBe(casesPerGuild);
      expect(new Set(guildCases).size).toBe(casesPerGuild);
      expect(guildCases).toEqual(
        Array.from({ length: casesPerGuild }, (_, i) => i + 1),
      );
    }
  });

  it("hands out contiguous numbers when existing cases already exist", async () => {
    const prisma = new FakePrisma();
    const repo = makeRepo(prisma);
    const guildId = "guild-seeded";

    // Pre-populate 5 cases sequentially
    for (let i = 1; i <= 5; i++) {
      await repo.createModerationCase({
        guildId,
        userId: `seed-${i}`,
        moderatorId: "mod",
        action: "warn",
      });
    }

    // Run 15 concurrent creations
    const N = 15;
    const concurrentResults = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        repo.createModerationCase({
          guildId,
          userId: `concurrent-${i}`,
          moderatorId: "mod",
          action: "kick",
        }),
      ),
    );

    const numbers = concurrentResults
      .map((c) => c.caseNumber)
      .sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(N);
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 6));
  });
});
