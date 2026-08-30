import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { createGuildTransaction } from "#lib/guild-transaction.js";

vi.mock("@sapphire/framework", () => ({
  container: {
    invalidation: { invalidate: vi.fn().mockResolvedValue(undefined) },
    db: {
      config: {
        invalidateGuildSettings: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

function mockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn((k: string, v: string, ..._rest: unknown[]) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    eval: vi.fn((script: string, _numkeys: number, key: string, token?: string) => {
      const current = store.get(key);
      if (script.includes("DEL")) {
        if (current === token) {
          store.delete(key);
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      }
      return Promise.resolve(current === token ? 1 : 0);
    }),
  };
}

function mockPrisma(existing: { id: string } | null) {
  return {
    guild: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "g-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("GuildWriteTransaction", () => {
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = mockRedis();
  });

  it("writes changes and releases the lock on submit", async () => {
    const prisma = mockPrisma({ id: "g-1" });
    const txn = await createGuildTransaction("g-1", redis as any, prisma as any);

    txn.write({ prefix: "!" });
    await txn.submit();

    expect(prisma.guild.update).toHaveBeenCalledWith({
      where: { id: "g-1" },
      data: { prefix: "!" },
    });
    expect(container.db.config.invalidateGuildSettings).toHaveBeenCalledWith(
      "g-1",
      true,
    );
    expect(txn.locking).toBe(false);
  });

  it("throws instead of writing when submit is called twice", async () => {
    const prisma = mockPrisma({ id: "g-1" });
    const txn = await createGuildTransaction("g-1", redis as any, prisma as any);

    txn.write({ prefix: "!" });
    await txn.submit();

    txn.write({ prefix: "?" });
    await expect(txn.submit()).rejects.toThrow(/already submitted/);
    expect(prisma.guild.update).toHaveBeenCalledTimes(1);
  });

  it("refuses to write when the lock was lost before submit", async () => {
    const prisma = mockPrisma({ id: "g-1" });
    const txn = await createGuildTransaction("g-1", redis as any, prisma as any);

    redis.store.delete("lumi:lock:guild:g-1");

    txn.write({ prefix: "!" });
    await expect(txn.submit()).rejects.toThrow(/Lock lost/);
    expect(prisma.guild.update).not.toHaveBeenCalled();
  });

  it("skips the write and releases the lock when there are no changes", async () => {
    const prisma = mockPrisma({ id: "g-1" });
    const txn = await createGuildTransaction("g-1", redis as any, prisma as any);

    await txn.submit();

    expect(prisma.guild.update).not.toHaveBeenCalled();
    expect(txn.locking).toBe(false);
  });
});
