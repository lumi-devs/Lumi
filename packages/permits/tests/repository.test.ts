import { describe, expect, it, vi } from "vitest";
import { PermitRepository } from "../src/repository.js";

const makePrisma = (overrides: Record<string, any> = {}) => {
  const basePermit = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: any) => ({
      id: 1,
      ...data,
      assignments: [],
    })),
    update: vi.fn(async ({ data }: any) => ({ ...data })),
    aggregate: vi.fn(async () => ({ _max: { number: null } })),
    delete: vi.fn(async () => ({})),
  };
  const base: Record<string, any> = {
    permit: basePermit,
    $transaction: vi.fn(async (fn: any) =>
      fn({
        permit: {
          update: vi.fn(async ({ data }: any) => ({ ...data })),
          create: vi.fn(async ({ data }: any) => ({
            id: 1,
            ...data,
            assignments: [],
          })),
        },
      }),
    ),
  };

  // Deep merge permit delegate
  if (overrides.permit) {
    base.permit = { ...basePermit, ...overrides.permit };
  }
  // Shallow merge other properties
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== "permit") {
      base[key] = value;
    }
  }

  return base;
};

describe("PermitRepository.createPermit", () => {
  it("stores every unique node on one permit", async () => {
    const prisma = makePrisma();
    const repo = new PermitRepository(prisma as any, {} as any);

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Staff",
      nodes: ["mod.ban", "mod.kick", "mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(prisma.permit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 3,
        nodes: ["mod.ban", "mod.kick"],
      }),
      include: { assignments: true },
    });
    expect(permit.nodes).toEqual(["mod.ban", "mod.kick"]);
    expect(permit.number).toBe(3);
  });

  it("allocates the smallest free custom number", async () => {
    const prisma = makePrisma({
      permit: {
        findMany: vi.fn(async () => [
          { number: 3 },
          { number: 4 },
          { number: 6 },
        ]),
      },
    });
    const repo = new PermitRepository(prisma as any, {} as any);

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Staff",
      nodes: ["mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(prisma.permit.findMany).toHaveBeenCalledWith({
      where: { guildId: "guild" },
      select: { number: true },
      orderBy: { number: "asc" },
    });
    expect(permit.number).toBe(5);
  });

  it("keeps an explicit number without allocating", async () => {
    const prisma = makePrisma();
    const repo = new PermitRepository(prisma as any, {} as any);

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Imported",
      number: 7,
      nodes: ["mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(prisma.permit.findMany).not.toHaveBeenCalled();
    expect(permit.number).toBe(7);
  });

  it("retries after a per-guild number conflict", async () => {
    const prisma = makePrisma({
      permit: {
        create: vi
          .fn()
          .mockRejectedValueOnce({
            code: "P2002",
            meta: { target: ["guild_id", "number"] },
          })
          .mockImplementationOnce(async ({ data }: any) => ({
            id: 1,
            ...data,
            assignments: [],
          })),
      },
    });
    const repo = new PermitRepository(prisma as any, {} as any);

    const permit = await repo.createPermit({
      guildId: "guild",
      name: "Staff",
      nodes: ["mod.ban"],
      polarity: "Grant",
      position: 0,
    });

    expect(prisma.permit.create).toHaveBeenCalledTimes(2);
    expect(permit.number).toBe(3);
  });

  it("rejects a permit without nodes", async () => {
    const prisma = makePrisma();
    const repo = new PermitRepository(prisma as any, {} as any);

    await expect(
      repo.createPermit({
        guildId: "guild",
        name: "Staff",
        nodes: [],
        polarity: "Grant",
        position: 0,
      }),
    ).rejects.toThrow("A permit needs at least one node.");
    expect(prisma.permit.create).not.toHaveBeenCalled();
  });
});

describe("PermitRepository.movePermit", () => {
  it("refuses to move a built-in permit", async () => {
    const prisma = makePrisma({
      permit: {
        findFirst: vi.fn(async () => ({
          id: 1,
          guildId: "guild",
          builtin: true,
          position: 0,
        })),
      },
    });
    const repo = new PermitRepository(prisma as any, {} as any);

    await expect(repo.movePermit("guild", 1, "up")).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
    const prisma = makePrisma({
      permit: { findFirst },
    });
    const repo = new PermitRepository(prisma as any, {} as any);

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
    const prisma = makePrisma({
      permit: {
        findFirst,
        update,
      },
      $transaction: vi.fn(async (fn: any) => fn({ permit: { update } })),
    });
    const repo = new PermitRepository(prisma as any, {} as any);

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

describe("PermitRepository.seedBuiltinPermits", () => {
  it("renumbers existing built-ins before creating missing ones", async () => {
    const findMany = vi.fn(async () => [
      { id: 5, name: "Extra Owner", number: 1 },
      { id: 6, name: "Trusted Admin", number: 2 },
    ]);
    const update = vi.fn(async () => ({}));
    const create = vi.fn(async ({ data }: any) => ({
      id: 7,
      ...data,
      assignments: [],
    }));
    const prisma = makePrisma({
      permit: { findMany, update, create },
      $transaction: vi.fn(async (fn: any) =>
        fn({ permit: { update, create } }),
      ),
    });
    const repo = new PermitRepository(prisma as any, {} as any);

    await repo.seedBuiltinPermits("guild");

    // No moves needed when already correct, so no transaction
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // But update is called to ensure builtin: true and whitelistScopes
    expect(update).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates missing built-in permits", async () => {
    const findMany = vi.fn(async () => []);
    const create = vi.fn(async ({ data }: any) => ({
      id: 7,
      ...data,
      assignments: [],
    }));
    const prisma = makePrisma({
      permit: { findMany, create },
      $transaction: vi.fn(async (fn: any) => fn({ permit: { create } })),
    });
    const repo = new PermitRepository(prisma as any, {} as any);

    await repo.seedBuiltinPermits("guild");

    // No moves needed, so no transaction
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Extra Owner",
          number: 1,
          builtin: true,
        }),
      }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Trusted Admin",
          number: 2,
          builtin: true,
        }),
      }),
    );
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

describe("PermitRepository.hasWhitelistScope", () => {
  const makeRepo = () =>
    new PermitRepository({} as any, { get: vi.fn(async () => null) } as any);

  it("accepts a matching grant scope", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [
        {
          custom: {
            grant: ["admin.*"],
            deny: [],
            scopes: ["security.antinuke"],
            denyScopes: [],
          },
        },
      ],
      isQuarantined: false,
    });

    await expect(
      repo.hasWhitelistScope(
        { guildId: "guild", userId: "user" },
        "security.antinuke",
      ),
    ).resolves.toBe(true);
  });

  it("covers every security scope with security.total", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [
        {
          custom: {
            grant: ["*"],
            deny: [],
            scopes: ["security.total"],
            denyScopes: [],
          },
        },
      ],
      isQuarantined: false,
    });

    await expect(
      repo.hasWhitelistScope(
        { guildId: "guild", userId: "user" },
        "security.automod",
      ),
    ).resolves.toBe(true);
  });

  it("lets a deny scope win inside the first tier", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [
        {
          custom: {
            grant: ["*"],
            deny: [],
            scopes: ["security.antinuke"],
            denyScopes: ["security.antinuke"],
          },
        },
      ],
      isQuarantined: false,
    });

    await expect(
      repo.hasWhitelistScope(
        { guildId: "guild", userId: "user" },
        "security.antinuke",
      ),
    ).resolves.toBe(false);
  });

  it("ignores whitelist scopes while quarantined", async () => {
    const repo = makeRepo();
    vi.spyOn(repo, "getPermitChain").mockResolvedValue({
      tiers: [
        {
          custom: {
            grant: ["*"],
            deny: [],
            scopes: ["security.total"],
            denyScopes: [],
          },
        },
      ],
      isQuarantined: true,
    });

    await expect(
      repo.hasWhitelistScope(
        { guildId: "guild", userId: "user" },
        "security.antinuke",
      ),
    ).resolves.toBe(false);
  });
});
