import { describe, it, expect, vi, beforeEach } from "bun:test";
import type { Container } from "#src/lib/Services.js";
import { EconomyRepository } from "#src/modules/economy/data/EconomyRepository.js";
import {
  AbortPurchase,
  account,
  bankName,
  currencyName,
  withCost,
} from "#src/lib/api/economy/Bank.js";
import { createMockPrismaClient } from "../../mocks/Prisma.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe("Bank api additions", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let services: Container;
  let getModuleConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    getModuleConfig = vi.fn().mockResolvedValue(null);
    const mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    const repo = new EconomyRepository(
      prisma as never,
      {} as never,
      mockLogger as never,
      mockDb as never,
    );
    services = {
      db: {
        economy: repo,
        config: { getModuleConfig, setModuleConfig: vi.fn() },
      },
    } as unknown as Container;
  });

  it("account auto-creates from the default balance", async () => {
    const view = await account(services, "g1", "u1");
    expect(view.name).toBe("Bank");
    expect(view.balance).toBe(100);
    const stored = await prisma.delegateFor("economyAccount").findUnique({
      where: { guildId_userId: { guildId: "g1", userId: "u1" } },
    });
    expect(stored).toMatchObject({ wallet: 100, bank: 0 });
  });

  it("account reports the stored total", async () => {
    prisma.$seed("economyAccount", [
      { guildId: "g1", userId: "u1", wallet: 40, bank: 60, lastPaydayAt: null },
    ]);
    const view = await account(services, "g1", "u1");
    expect(view.balance).toBe(100);
  });

  it("currencyName and bankName read guild config", async () => {
    await expect(currencyName(services, "g1")).resolves.toBe("credits");
    await expect(bankName(services, "g1")).resolves.toBe("Bank");
    getModuleConfig.mockImplementation((_g: string, _m: string, key: string) => {
      if (key === "currency_name") return Promise.resolve("gil");
      if (key === "bank_name") return Promise.resolve("Vault");
      return Promise.resolve(null);
    });
    await expect(currencyName(services, "g1")).resolves.toBe("gil");
    await expect(bankName(services, "g1")).resolves.toBe("Vault");
  });

  it("withCost refunds and resolves silently on AbortPurchase", async () => {
    prisma.$seed("economyAccount", [
      { guildId: "g1", userId: "u1", wallet: 100, bank: 50, lastPaydayAt: null },
    ]);
    const result = await withCost(services, "g1", "u1", 10, async () => {
      throw new AbortPurchase();
    });
    expect(result).toBeUndefined();
    const stored = await prisma.delegateFor("economyAccount").findUnique({
      where: { guildId_userId: { guildId: "g1", userId: "u1" } },
    });
    expect(stored).toMatchObject({ wallet: 100, bank: 50 });
  });

  it("withCost refunds and propagates other errors", async () => {
    prisma.$seed("economyAccount", [
      { guildId: "g1", userId: "u1", wallet: 100, bank: 50, lastPaydayAt: null },
    ]);
    await expect(
      withCost(services, "g1", "u1", 10, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const stored = await prisma.delegateFor("economyAccount").findUnique({
      where: { guildId_userId: { guildId: "g1", userId: "u1" } },
    });
    expect(stored).toMatchObject({ wallet: 100, bank: 50 });
  });

  it("withCost returns the wrapped value on success", async () => {
    prisma.$seed("economyAccount", [
      { guildId: "g1", userId: "u1", wallet: 100, bank: 50, lastPaydayAt: null },
    ]);
    await expect(
      withCost(services, "g1", "u1", 10, async () => "done"),
    ).resolves.toBe("done");
  });
});
