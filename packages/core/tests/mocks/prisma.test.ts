import { describe, expect, it, beforeEach } from "vitest";
import { createMockPrismaClient, type MockPrismaClient } from "./prisma.js";
import { AfkRepository } from "#lib/prisma/repositories/AfkRepository.js";

describe("MockPrismaClient (offline in-memory Postgres test driver)", () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrismaClient();
  });

  it("creates a model table lazily on first access", async () => {
    expect(await prisma.someModel.findMany()).toEqual([]);
  });

  it("supports create / findUnique / findMany / count", async () => {
    await prisma.widget.create({ data: { id: "1", name: "a" } });
    await prisma.widget.create({ data: { id: "2", name: "b" } });

    expect(await prisma.widget.findUnique({ where: { id: "1" } })).toEqual({ id: "1", name: "a" });
    expect(await prisma.widget.findMany({ where: { name: "b" } })).toEqual([{ id: "2", name: "b" }]);
    expect(await prisma.widget.count()).toBe(2);
  });

  it("matches flattened compound-unique keys, e.g. @@id([userId, guildId])", async () => {
    prisma.$seed("afkEntry", [{ userId: "u1", guildId: "g1", reason: "AFK", since: new Date() }]);

    const found = await prisma.afkEntry.findUnique({
      where: { userId_guildId: { userId: "u1", guildId: "g1" } },
    });
    expect(found).toMatchObject({ userId: "u1", guildId: "g1" });

    const missing = await prisma.afkEntry.findUnique({
      where: { userId_guildId: { userId: "u1", guildId: "other" } },
    });
    expect(missing).toBeNull();
  });

  it("supports upsert (create branch, then update branch)", async () => {
    const created = await prisma.counter.upsert({
      where: { id: "c1" },
      update: { value: { increment: 1 } },
      create: { id: "c1", value: 0 },
    });
    expect(created).toEqual({ id: "c1", value: 0 });

    const updated = await prisma.counter.upsert({
      where: { id: "c1" },
      update: { value: { increment: 1 } },
      create: { id: "c1", value: 0 },
    });
    expect(updated).toEqual({ id: "c1", value: 1 });
  });

  it("supports updateMany, deleteMany, and scalar filter operators", async () => {
    prisma.$seed("item", [
      { id: "1", score: 5 },
      { id: "2", score: 15 },
      { id: "3", score: 25 },
    ]);

    const { count: updatedCount } = await prisma.item.updateMany({
      where: { score: { gte: 10 } },
      data: { score: { increment: 100 } },
    });
    expect(updatedCount).toBe(2);
    expect(await prisma.item.findMany({ where: { score: { gte: 100 } } })).toHaveLength(2);

    const { count: deletedCount } = await prisma.item.deleteMany({ where: { score: { lt: 10 } } });
    expect(deletedCount).toBe(1);
    expect(await prisma.item.count()).toBe(2);
  });

  it("throws a P2025-shaped error when update/delete finds no match", async () => {
    await expect(prisma.ghost.update({ where: { id: "nope" }, data: {} })).rejects.toMatchObject({
      code: "P2025",
    });
    await expect(prisma.ghost.delete({ where: { id: "nope" } })).rejects.toMatchObject({
      code: "P2025",
    });
  });

  it("supports both $transaction forms", async () => {
    await prisma.tx.create({ data: { id: "1" } });

    const [a, b] = await prisma.$transaction([prisma.tx.count(), prisma.tx.findMany()]);
    expect(a).toBe(1);
    expect(b).toHaveLength(1);

    const viaCallback = await prisma.$transaction(async (tx) => {
      await tx.tx.create({ data: { id: "2" } });
      return tx.tx.count();
    });
    expect(viaCallback).toBe(2);
  });

  it("drives a real repository end-to-end with no live Postgres involved", async () => {
    const mockRedis = {
      get: () => Promise.resolve(null),
      setex: () => Promise.resolve("OK"),
    } as never;
    const mockLogger = { warn: () => {}, info: () => {}, error: () => {} } as never;
    const repo = new AfkRepository(prisma as never, mockRedis, mockLogger, {} as never);

    const upserted = await repo.upsertEntry("g1", "u1", "brb");
    expect(upserted).toMatchObject({ guildId: "g1", userId: "u1", reason: "brb" });

    expect(await repo.countAll()).toBe(1);
    expect(await repo.findEntry("g1", "u1")).toMatchObject({ reason: "brb" });

    await repo.deleteEntry("g1", "u1");
    expect(await repo.countAll()).toBe(0);
  });
});
