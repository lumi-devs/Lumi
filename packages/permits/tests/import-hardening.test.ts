import { describe, expect, it, vi } from "vitest";
import { type PermitExportData, importPermits } from "../src/transfer.js";

function exportData(
  overrides: Partial<PermitExportData> = {},
): PermitExportData {
  return {
    version: 1,
    exportedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    guildId: "guild",
    permits: [
      {
        id: 10,
        guildId: "guild",
        name: "Imported",
        number: 5,
        nodes: ["mod.ban"],
        polarity: "Grant",
        position: 0,
        builtin: false,
        expiresAt: null,
        schedule: null,
        timezone: null,
        conditions: null,
        whitelistScopes: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    ],
    assignments: [],
    ...overrides,
  };
}

function setup() {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 1,
    ...data,
  }));
  const tx = {
    permit: {
      findUnique: vi.fn(async () => null),
      create,
      delete: vi.fn(async () => undefined),
    },
    permitAssignment: {
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "audit",
        ...data,
        createdAt: new Date(),
      })),
    },
  };
  const db = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<void>) =>
      run(tx),
    ),
  };
  return { db: db as never, create };
}

describe("permit import hardening", () => {
  it("rejects owner-level nodes by default", async () => {
    const { db, create } = setup();
    const data = exportData();
    const permit = {
      ...data.permits[0]!,
      nodes: ["*"],
    };

    const result = await importPermits(db, "guild", {
      ...data,
      permits: [permit],
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("allows owner-level nodes only with an explicit opt-in and never as built-in", async () => {
    const { db, create } = setup();
    const data = exportData();
    const permit = {
      ...data.permits[0]!,
      nodes: ["*"],
      builtin: true,
    };

    const result = await importPermits(
      db,
      "guild",
      { ...data, permits: [permit] },
      { skipBuiltins: false, allowOwnerNodes: true },
    );

    expect(result.imported).toBe(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nodes: ["*"], builtin: false }),
    });
  });

  it("rejects unknown whitelist scopes", async () => {
    const { db, create } = setup();
    const data = exportData();
    const permit = {
      ...data.permits[0]!,
      whitelistScopes: ["security.total", "security.root"],
    };

    const result = await importPermits(db, "guild", {
      ...data,
      permits: [permit],
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns an error instead of throwing for malformed permit data", async () => {
    const { db, create } = setup();
    const data = exportData();
    const permit = {
      ...data.permits[0]!,
      nodes: "mod.ban",
    };

    const result = await importPermits(db, "guild", {
      ...data,
      permits: [permit as never],
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns an error when permits or assignments are not arrays", async () => {
    const { db, create } = setup();

    const result = await importPermits(db, "guild", {
      ...exportData(),
      permits: null,
    } as never);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns an error when assignments is not an array", async () => {
    const { db, create } = setup();

    const result = await importPermits(db, "guild", {
      ...exportData(),
      assignments: "mod.ban",
    } as never);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("reports malformed assignment records without throwing", async () => {
    const { db, create } = setup();

    const result = await importPermits(db, "guild", {
      ...exportData(),
      assignments: [null, { permitId: "nope" }],
    } as never);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects assignments with invalid target fields", async () => {
    const { db, create } = setup();

    const result = await importPermits(db, "guild", {
      ...exportData(),
      assignments: [
        {
          id: 1,
          permitId: 10,
          guildId: "guild",
          targetType: "USER",
          targetId: 42,
          grantedBy: "admin",
          grantedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
          expiresAt: null,
        },
      ],
    } as never);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });
});
