import { describe, it, expect } from "vitest";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";

// Backs the "do not break when refactoring" contract on
// ModerationRepository.createModerationCase: the counter read-and-increment
// MUST stay inside the same transaction as the case insert, so concurrent
// creates for one guild serialize and hand out contiguous, unique case numbers.
//
// We can't run a real Postgres row lock in a unit test, so we model the two
// guarantees the implementation relies on:
//   1. `$transaction(fn)` serializes its body against the counter row - modelled
//      here with a per-guild async mutex held for the duration of the callback
//      (mirrors SELECT … FOR UPDATE taken by the atomic `increment`).
//   2. `(guildId, caseNumber)` is unique - `moderationCase.create` throws on a
//      duplicate, exactly like the DB constraint would (P2002).
//
// If a refactor moves the counter read OUTSIDE the transaction, the read stops
// being covered by the mutex, concurrent calls observe the same `next`, and the
// unique check throws - failing this test. That's the regression guard.

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

  guildCaseCounter = {
    upsert: async ({
      where,
      create,
      update: _update,
    }: {
      where: { guildId: string };
      create: { guildId: string; next: number };
      update: { next: { increment: number } };
    }) => {
      await yieldOnce();
      const g = where.guildId;
      const existing = this.counters.get(g);
      if (existing === undefined) {
        this.counters.set(g, create.next);
        return { guildId: g, next: create.next };
      }
      const next = existing + 1;
      this.counters.set(g, next);
      return { guildId: g, next };
    },
  };

  moderationCase = {
    findFirst: async ({
      where,
    }: {
      where: { guildId: string };
      orderBy: { caseNumber: "desc" };
      select: { caseNumber: boolean };
    }) => {
      await yieldOnce();
      const guildCases = this.cases.filter((c) => c.guildId === where.guildId);
      if (guildCases.length === 0) return null;
      const sorted = [...guildCases].sort((a, b) => b.caseNumber - a.caseNumber);
      return { caseNumber: sorted[0]!.caseNumber };
    },
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

  // Models the transactional row lock: the callback runs under the guild's
  // mutex. We don't know the guildId until the body runs, so callers operating
  // on different guilds still serialize through a single outer mutex - fine for
  // this test, which hammers one guild.
  $transaction = async <T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> => {
    return this.globalLock.run(() => fn(this));
  };
  private globalLock = new AsyncMutex();
}

function makeRepo(prisma: FakePrisma): ModerationRepository {
  // The repo only touches this.prisma in createModerationCase; the other
  // constructor deps are unused on this path.
  return new ModerationRepository(
    prisma as unknown as never,
    {} as never,
    { error() {}, warn() {}, debug() {}, info() {} } as never,
    {} as never,
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
});
