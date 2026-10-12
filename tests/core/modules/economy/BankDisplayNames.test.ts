import { describe, it, expect, vi, mock, beforeEach } from "bun:test";
import type { Container } from "#src/lib/Services.js";
import { EconomyRepository } from "#src/modules/economy/data/EconomyRepository.js";
import { balanceDef } from "#src/modules/economy/commands/Balance.js";
import { bankDef } from "#src/modules/economy/commands/Bank.js";
import { createMockPrismaClient } from "../../mocks/Prisma.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const container: Record<string, unknown> = {};

mock.module("#src/lib/Services.js", () => ({ container }));

describe("economy display names", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let services: Container;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    const getModuleConfig = vi.fn(
      (_guildId: string, _module: string, key: string) =>
        Promise.resolve(key === "bank_name" ? "Vault" : null),
    );
    const mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    const repo = new EconomyRepository(
      prisma as never,
      {} as never,
      mockLogger as never,
      mockDb as never,
    );
    container["db"] = { economy: repo };
    container["logger"] = mockLogger;
    services = {
      db: {
        config: { getModuleConfig, setModuleConfig: vi.fn() },
      },
    } as unknown as Container;
    prisma.$seed("economyAccount", [
      { guildId: "g1", userId: "u1", wallet: 100, bank: 50, lastPaydayAt: null },
    ]);
  });

  it("balance labels the bank with the configured bank name", async () => {
    const seen: { title: string; body: string }[] = [];
    const ctx = {
      guildId: "g1",
      services,
      user: { id: "u1", username: "Ada" },
      getUser: vi.fn().mockResolvedValue(null),
      replyInfo: vi.fn((title: string, body: string) => {
        seen.push({ title, body });
        return Promise.resolve(undefined);
      }),
      replyError: vi.fn().mockResolvedValue(undefined),
    };
    await balanceDef.run?.(ctx as never);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toContain("Vault:");
    expect(seen[0]?.body).not.toContain("Bank:");
  });

  it("deposit confirms with the configured bank name", async () => {
    const seen: { title: string; body: string }[] = [];
    const ctx = {
      guildId: "g1",
      services,
      user: { id: "u1", username: "Ada" },
      getInteger: vi.fn().mockResolvedValue(10),
      replySuccess: vi.fn((title: string, body: string) => {
        seen.push({ title, body });
        return Promise.resolve(undefined);
      }),
      replyError: vi.fn().mockResolvedValue(undefined),
    };
    const deposit = bankDef.handlers?.["deposit"];
    expect(deposit).toBeDefined();
    await (deposit as (ctx: unknown) => Promise<void>)(ctx);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toContain("Vault:");
    expect(seen[0]?.body).not.toContain("Bank:");
  });
});
