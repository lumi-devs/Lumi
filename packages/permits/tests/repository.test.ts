import { describe, expect, it, vi } from "vitest";
import { PermitRepository } from "../src/repository.js";

const repository = (findFirst: any, transaction: any = vi.fn()) =>
  new PermitRepository(
    { permit: { findFirst }, $transaction: transaction } as any,
    {} as any,
  );

describe("PermitRepository.createPermit", () => {
  it("stores every unique node on one permit", async () => {
    const findMany = vi.fn(async () => []);
    const create = vi.fn(async ({ data }: any) => ({
      id: 1,
      ...data,
      assignments: [],
    }));
    const repo = new PermitRepository(
      { permit: { create, findMany } } as any,
      {} as any,
    );

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Staff",
      nodes: ["mod.ban", "mod.kick", "mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 1,
        nodes: ["mod.ban", "mod.kick"],
      }),
      include: { assignments: true },
    });
    expect(permit.nodes).toEqual(["mod.ban", "mod.kick"]);
    expect(permit.number).toBe(1);
  });

  it("allocates the smallest free per-guild number", async () => {
    const findMany = vi.fn(async () => [
      { number: 1 },
      { number: 2 },
      { number: 4 },
    ]);
    const create = vi.fn(async ({ data }: any) => ({
      id: 5,
      ...data,
      assignments: [],
    }));
    const repo = new PermitRepository(
      { permit: { create, findMany } } as any,
      {} as any,
    );

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Staff",
      nodes: ["mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { guildId: "guild" },
      select: { number: true },
      orderBy: { number: "asc" },
    });
    expect(permit.number).toBe(3);
  });

  it("keeps an explicit number without allocating", async () => {
    const findMany = vi.fn(async () => []);
    const create = vi.fn(async ({ data }: any) => ({
      id: 9,
      ...data,
      assignments: [],
    }));
    const repo = new PermitRepository(
      { permit: { create, findMany } } as any,
      {} as any,
    );

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Imported",
      number: 7,
      nodes: ["mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(permit.number).toBe(7);
  });

  it("retries after a per-guild number conflict", async () => {
    const findMany = vi.fn(async () => []);
    const create = vi
      .fn()
      .mockRejectedValueOnce({
        code: "P2002",
        meta: { target: ["guild_id", "number"] },
      })
      .mockImplementationOnce(async ({ data }: any) => ({
        id: 1,
        ...data,
        assignments: [],
      }));
    const repo = new PermitRepository(
      { permit: { create, findMany } } as any,
      {} as any,
    );

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Staff",
      nodes: ["mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(permit.number).toBe(1);
  });

  it("rejects a permit without nodes", async () => {
    const create = vi.fn();
    const repo = new PermitRepository(
      { permit: { create } } as any,
      {} as any,
    );

    await expect(
      repo.createPermit({
        guildId: "guild",
        name: "Staff",
        nodes: [],
        polarity: "Grant",
        position: 0,
      }),
    ).rejects.toThrow("A permit needs at least one node.");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("PermitRepository.movePermit", () => {
  it("refuses to move a built-in permit", async () => {
    const findFirst = vi.fn(async () => ({
      id: 1,
      guildId: "guild",
      builtin: true,
      position: 0,
    }));
    const transaction = vi.fn();
    const repo = repository(findFirst, transaction);

    await expect(repo.movePermit("guild", 1, "up")).resolves.toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not swap a custom permit with a built-in permit", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 2,
        guildId: "guild",
        builtin: false,
        position: 2,
      })
      .mockResolvedValueOnce(null);
    const repo = repository(findFirst);

    await expect(repo.movePermit("guild", 2, "up")).resolves.toBe(false);
    expect(findFirst.mock.calls[1]![0].where.builtin).toBe(false);
  });

  it("swaps two custom permits", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 2,
        guildId: "guild",
        builtin: false,
        position: 2,
      })
      .mockResolvedValueOnce({
        id: 3,
        guildId: "guild",
        builtin: false,
        position: 3,
      });
    const update = vi.fn(async () => ({}));
    const transaction = vi.fn(async (callback: any) =>
      callback({ permit: { update } }),
    );
    const repo = repository(findFirst, transaction);

    await expect(repo.movePermit("guild", 2, "down")).resolves.toBe(true);
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 2 },
      data: { position: 3 },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 3 },
      data: { position: 2 },
    });
  });
});

describe("PermitRepository.hasGrantNode", () => {
  const makeRepo = () =>
    new PermitRepository({} as any, { get: vi.fn(async () => null) } as any);

  it("grants only when a custom permit contains the exact node", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [{ custom: { grant: ["*"], deny: [] } }],
      isQuarantined: false,
    });

    await expect(
      repo.hasGrantNode({
        guildId: "guild",
        userId: "owner",
        permitNode: "*",
      }),
    ).resolves.toBe(true);
    await expect(
      repo.hasGrantNode({
        guildId: "guild",
        userId: "owner",
        permitNode: "admin.*",
      }),
    ).resolves.toBe(true);
  });

  it("does not treat admin.* as an Extra Owner grant", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [{ custom: { grant: ["admin.*"], deny: [] } }],
      isQuarantined: false,
    });

    await expect(
      repo.hasGrantNode({
        guildId: "guild",
        userId: "admin",
        permitNode: "*",
      }),
    ).resolves.toBe(false);
  });

  it("lets a deny in the first tier win", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [
        { custom: { grant: ["*"], deny: ["*"] } },
        { custom: { grant: ["*"], deny: [] } },
      ],
      isQuarantined: false,
    });

    await expect(
      repo.hasGrantNode({
        guildId: "guild",
        userId: "denied",
        permitNode: "*",
      }),
    ).resolves.toBe(false);
  });

  it("ignores every grant while quarantined", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [{ custom: { grant: ["*"], deny: [] } }],
      isQuarantined: true,
    });

    await expect(
      repo.hasGrantNode({
        guildId: "guild",
        userId: "quarantined",
        permitNode: "*",
      }),
    ).resolves.toBe(false);
  });
});
